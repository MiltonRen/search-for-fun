import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  isAsExpression,
  isBinaryExpression,
  isElementAccessExpression,
  isNonNullExpression,
  isNoSubstitutionTemplateLiteral,
  isParenthesizedExpression,
  isPostfixUnaryExpression,
  isPrefixUnaryExpression,
  isPropertyAccessExpression,
  isSatisfiesExpression,
  isStringLiteral,
  isTypeAssertion,
  SyntaxKind,
  type Expression,
  type Node,
  type SourceFile,
} from "typescript/unstable/ast";
import { API, type Snapshot } from "typescript/unstable/sync";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const VECTOR_TRANSFORM_PROPERTIES = new Set(["pos", "worldPos", "screenPos", "scale", "skew"]);
const VECTOR_AXES = new Set(["x", "y"]);
const ASSIGNMENT_OPERATORS = new Set<SyntaxKind>([
  SyntaxKind.EqualsToken,
  SyntaxKind.PlusEqualsToken,
  SyntaxKind.MinusEqualsToken,
  SyntaxKind.AsteriskEqualsToken,
  SyntaxKind.AsteriskAsteriskEqualsToken,
  SyntaxKind.SlashEqualsToken,
  SyntaxKind.PercentEqualsToken,
  SyntaxKind.LessThanLessThanEqualsToken,
  SyntaxKind.GreaterThanGreaterThanEqualsToken,
  SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  SyntaxKind.AmpersandEqualsToken,
  SyntaxKind.BarEqualsToken,
  SyntaxKind.CaretEqualsToken,
  SyntaxKind.BarBarEqualsToken,
  SyntaxKind.AmpersandAmpersandEqualsToken,
  SyntaxKind.QuestionQuestionEqualsToken,
]);

interface UnsafeTransformWrite {
  filePath: string;
  line: number;
  column: number;
  expression: string;
}

async function collectSourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectSourceFiles(entryPath));
    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(entryPath);
  }
  return files.sort();
}

function unwrapExpression(expression: Expression): Expression {
  let current = expression;
  while (
    isParenthesizedExpression(current) ||
    isAsExpression(current) ||
    isTypeAssertion(current) ||
    isNonNullExpression(current) ||
    isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function staticPropertyName(expression: Expression): string | undefined {
  const unwrapped = unwrapExpression(expression);
  if (isPropertyAccessExpression(unwrapped)) return unwrapped.name.text;
  if (isElementAccessExpression(unwrapped)) {
    const argument = unwrapped.argumentExpression && unwrapExpression(unwrapped.argumentExpression);
    if (argument && (isStringLiteral(argument) || isNoSubstitutionTemplateLiteral(argument))) {
      return argument.text;
    }
  }
  return undefined;
}

function propertyReceiver(expression: Expression): Expression | undefined {
  const unwrapped = unwrapExpression(expression);
  if (isPropertyAccessExpression(unwrapped) || isElementAccessExpression(unwrapped)) {
    return unwrapExpression(unwrapped.expression);
  }
  return undefined;
}

function mutationTarget(node: Node): Expression | undefined {
  if (isBinaryExpression(node) && ASSIGNMENT_OPERATORS.has(node.operatorToken.kind)) {
    return unwrapExpression(node.left);
  }
  if (
    (isPrefixUnaryExpression(node) || isPostfixUnaryExpression(node)) &&
    (node.operator === SyntaxKind.PlusPlusToken || node.operator === SyntaxKind.MinusMinusToken)
  ) {
    return unwrapExpression(node.operand);
  }
  return undefined;
}

function findUnsafeTransformWrites(filePath: string, source: SourceFile): UnsafeTransformWrite[] {
  const issues: UnsafeTransformWrite[] = [];

  const visit = (node: Node): void => {
    const target = mutationTarget(node);
    if (target) {
      const axis = staticPropertyName(target);
      const vectorExpression = propertyReceiver(target);
      const property = vectorExpression && staticPropertyName(vectorExpression);
      if (axis && VECTOR_AXES.has(axis) && property && VECTOR_TRANSFORM_PROPERTIES.has(property)) {
        const location = source.getLineAndCharacterOfPosition(target.getStart(source));
        issues.push({
          filePath,
          line: location.line + 1,
          column: location.character + 1,
          expression: target.getText(source),
        });
      }
    }
    node.forEachChild(visit);
  };

  visit(source);
  return issues;
}

/**
 * KAPLAY v4000 alpha.25 introduced cached transforms. Mutating an axis on a
 * transform Vec2 changes the returned value without invalidating the rendered
 * transform, so simulation state and pixels silently diverge. Keep this check
 * at the import boundary so a broken prototype can never become a sealed node.
 */
export async function validateKaplayTransformWrites(gameDirectory: string): Promise<void> {
  const absoluteGameDirectory = path.resolve(gameDirectory);
  const sourceFiles = await collectSourceFiles(absoluteGameDirectory);
  const api = new API({ cwd: absoluteGameDirectory });
  let snapshot: Snapshot | undefined;
  let issues: UnsafeTransformWrite[] = [];
  try {
    const currentSnapshot = snapshot = api.updateSnapshot({ openFiles: sourceFiles });
    issues = sourceFiles.flatMap((filePath) => {
      const project = currentSnapshot.getDefaultProjectForFile(filePath);
      const source = project?.program.getSourceFile(filePath);
      if (!source) throw new Error(`TypeScript could not inspect staged source: ${filePath}`);
      return findUnsafeTransformWrites(filePath, source);
    });
  } finally {
    snapshot?.dispose();
    api.close();
  }

  if (issues.length === 0) return;

  const details = issues.slice(0, 12).map((issue) => {
    const relativePath = path.relative(absoluteGameDirectory, issue.filePath).replaceAll(path.sep, "/");
    return `- ${relativePath}:${issue.line}:${issue.column} mutates ${issue.expression}`;
  });
  if (issues.length > details.length) details.push(`- and ${issues.length - details.length} more`);

  throw new Error([
    "KAPLAY v4000 transform mutation is unsafe and can create frozen actors or detached effects.",
    ...details,
    "Assign the complete vector (for example, actor.pos = k.vec2(nextX, nextY)) or use KAPLAY helpers such as move(), moveBy(), moveTo(), scaleTo(), or scaleBy().",
  ].join("\n"));
}
