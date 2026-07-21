import { useEffect, useState, type CSSProperties, type KeyboardEvent } from "react";

type Scene = "linear" | "search";
type AnimationStyle = CSSProperties & { "--delay": string };

interface Point {
  x: number;
  y: number;
  delay: number;
  radius?: number;
}

interface Edge {
  from: [number, number];
  to: [number, number];
  delay: number;
}

const LINEAR_POINTS: Point[] = [
  { x: 70, y: 430, delay: 0.08, radius: 10 },
  { x: 150, y: 270, delay: 0.35 },
  { x: 285, y: 400, delay: 0.77 },
  { x: 355, y: 270, delay: 1.09 },
  { x: 500, y: 380, delay: 1.5 },
  { x: 590, y: 290, delay: 1.78 },
  { x: 715, y: 365, delay: 2.1 },
  { x: 825, y: 305, delay: 2.38 },
  { x: 920, y: 350, delay: 2.61 },
  { x: 1045, y: 318, delay: 2.89 },
  { x: 1210, y: 340, delay: 3.26, radius: 10 },
];

const SEARCH_EDGES: Edge[] = [
  // First, search widely around the cheap early stage.
  { from: [74, 356], to: [152, 205], delay: 0.34 },
  { from: [74, 356], to: [151, 300], delay: 0.4 },
  { from: [74, 356], to: [154, 395], delay: 0.46 },
  { from: [74, 356], to: [150, 494], delay: 0.52 },
  { from: [152, 205], to: [244, 132], delay: 0.74 },
  { from: [152, 205], to: [250, 221], delay: 0.8 },
  { from: [151, 300], to: [250, 275], delay: 0.86 },
  { from: [151, 300], to: [246, 342], delay: 0.92 },
  { from: [154, 395], to: [246, 342], delay: 0.98 },
  { from: [154, 395], to: [250, 423], delay: 1.04 },
  { from: [150, 494], to: [244, 471], delay: 1.1 },
  { from: [150, 494], to: [248, 552], delay: 1.16 },
  { from: [244, 132], to: [322, 82], delay: 1.3 },
  { from: [244, 132], to: [326, 151], delay: 1.36 },
  { from: [250, 221], to: [338, 202], delay: 1.42 },
  { from: [250, 221], to: [335, 260], delay: 1.48 },
  { from: [250, 275], to: [335, 260], delay: 1.54 },
  { from: [246, 342], to: [340, 327], delay: 1.6 },
  { from: [250, 423], to: [340, 408], delay: 1.66 },
  { from: [250, 423], to: [330, 470], delay: 1.72 },
  { from: [244, 471], to: [330, 470], delay: 1.78 },
  { from: [248, 552], to: [327, 530], delay: 1.84 },
  { from: [248, 552], to: [326, 600], delay: 1.9 },
  { from: [338, 202], to: [420, 166], delay: 2.02 },
  { from: [338, 202], to: [429, 224], delay: 2.08 },
  { from: [340, 327], to: [432, 306], delay: 2.14 },
  { from: [340, 327], to: [430, 366], delay: 2.2 },
  { from: [340, 408], to: [430, 366], delay: 2.26 },
  { from: [340, 408], to: [428, 441], delay: 2.32 },
  { from: [330, 470], to: [417, 505], delay: 2.38 },
  { from: [327, 530], to: [417, 505], delay: 2.44 },
  { from: [326, 600], to: [408, 576], delay: 2.5 },
  // Keep only a few promising branches through the middle.
  { from: [432, 306], to: [526, 285], delay: 2.62 },
  { from: [432, 306], to: [528, 345], delay: 2.68 },
  { from: [430, 366], to: [528, 345], delay: 2.74 },
  { from: [430, 366], to: [526, 414], delay: 2.8 },
  { from: [428, 441], to: [526, 414], delay: 2.86 },
  { from: [526, 285], to: [626, 322], delay: 3.02 },
  { from: [528, 345], to: [626, 322], delay: 3.08 },
  { from: [526, 414], to: [626, 389], delay: 3.14 },
  { from: [526, 285], to: [602, 229], delay: 3.08 },
  { from: [602, 229], to: [682, 254], delay: 3.3 },
  { from: [626, 322], to: [704, 282], delay: 3.38 },
  { from: [526, 414], to: [604, 466], delay: 3.2 },
  { from: [604, 466], to: [684, 434], delay: 3.42 },
  { from: [626, 389], to: [704, 418], delay: 3.48 },
  { from: [626, 322], to: [724, 350], delay: 3.3 },
  { from: [626, 389], to: [724, 350], delay: 3.36 },
  // One earned direction receives the expensive late-stage work.
  { from: [724, 350], to: [820, 326], delay: 3.82 },
  { from: [820, 326], to: [918, 349], delay: 4.06 },
  { from: [918, 349], to: [1014, 320], delay: 4.3 },
  { from: [1014, 320], to: [1110, 342], delay: 4.54 },
  { from: [1110, 342], to: [1208, 320], delay: 4.78 },
];

const SEARCH_POINTS: Point[] = [
  { x: 74, y: 356, delay: 0.16, radius: 10 },
  { x: 152, y: 205, delay: 0.68 }, { x: 151, y: 300, delay: 0.68 },
  { x: 154, y: 395, delay: 0.68 }, { x: 150, y: 494, delay: 0.68 },
  { x: 244, y: 132, delay: 1.22 }, { x: 250, y: 221, delay: 1.22 },
  { x: 250, y: 275, delay: 1.22 }, { x: 246, y: 342, delay: 1.22 },
  { x: 250, y: 423, delay: 1.22 }, { x: 244, y: 471, delay: 1.22 },
  { x: 248, y: 552, delay: 1.22 },
  { x: 322, y: 82, delay: 1.78 }, { x: 326, y: 151, delay: 1.78 },
  { x: 338, y: 202, delay: 1.78 }, { x: 335, y: 260, delay: 1.78 },
  { x: 340, y: 327, delay: 1.78, radius: 9 }, { x: 340, y: 408, delay: 1.78 },
  { x: 330, y: 470, delay: 1.78 }, { x: 327, y: 530, delay: 1.78 },
  { x: 326, y: 600, delay: 1.78 },
  { x: 420, y: 166, delay: 2.36 }, { x: 429, y: 224, delay: 2.36 },
  { x: 432, y: 306, delay: 2.36, radius: 9 }, { x: 430, y: 366, delay: 2.36, radius: 9 },
  { x: 428, y: 441, delay: 2.36, radius: 9 }, { x: 417, y: 505, delay: 2.36 },
  { x: 408, y: 576, delay: 2.36 },
  { x: 526, y: 285, delay: 2.94 }, { x: 528, y: 345, delay: 2.94, radius: 9 },
  { x: 526, y: 414, delay: 2.94 }, { x: 626, y: 322, delay: 3.26, radius: 9 },
  { x: 626, y: 389, delay: 3.26 },
  { x: 602, y: 229, delay: 3.26 }, { x: 682, y: 254, delay: 3.5 },
  { x: 704, y: 282, delay: 3.56 },
  { x: 604, y: 466, delay: 3.38 }, { x: 684, y: 434, delay: 3.62 },
  { x: 704, y: 418, delay: 3.68 }, { x: 724, y: 350, delay: 3.5, radius: 10 },
  { x: 820, y: 326, delay: 4.02 }, { x: 918, y: 349, delay: 4.26 },
  { x: 1014, y: 320, delay: 4.5 }, { x: 1110, y: 342, delay: 4.74 },
  { x: 1208, y: 320, delay: 4.98, radius: 10 },
];

function animationStyle(delay: number): AnimationStyle {
  return { "--delay": `${delay}s` };
}

function CostGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="45" y1="0" x2="1235" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stopColor="#55d99b" />
      <stop offset="0.42" stopColor="#78d880" />
      <stop offset="0.63" stopColor="#f0cf64" />
      <stop offset="0.82" stopColor="#ff9a4a" />
      <stop offset="1" stopColor="#ff6b35" />
    </linearGradient>
  );
}

function Node({ point }: { point: Point }) {
  return (
    <g className="story-node" style={animationStyle(point.delay)}>
      <circle className="story-node-halo" cx={point.x} cy={point.y} r={(point.radius ?? 7) + 7} />
      <circle className="story-node-core" cx={point.x} cy={point.y} r={point.radius ?? 7} />
    </g>
  );
}

function LinearScene() {
  const path = LINEAR_POINTS.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  return (
    <svg className="story-scene story-scene-linear" viewBox="0 0 1280 720" aria-hidden="true">
      <defs>
        <CostGradient id="linear-cost" />
        <filter id="linear-glow" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path className="story-ghost-path" d={path} />
      <path className="story-linear-path story-path-glow" d={path} stroke="url(#linear-cost)" pathLength="1" filter="url(#linear-glow)" />
      <path className="story-linear-path" d={path} stroke="url(#linear-cost)" pathLength="1" />
      {LINEAR_POINTS.map((point) => <Node key={`${point.x}-${point.y}`} point={point} />)}
    </svg>
  );
}

function SearchScene() {
  return (
    <svg className="story-scene story-scene-search" viewBox="0 0 1280 720" aria-hidden="true">
      <defs>
        <CostGradient id="search-cost" />
        <filter id="search-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g className="story-search-glow" filter="url(#search-glow)">
        {SEARCH_EDGES.map((edge, index) => (
          <line
            className="story-edge story-path-glow"
            key={`glow-${index}`}
            x1={edge.from[0]}
            y1={edge.from[1]}
            x2={edge.to[0]}
            y2={edge.to[1]}
            stroke="url(#search-cost)"
            pathLength="1"
            style={animationStyle(edge.delay)}
          />
        ))}
      </g>
      {SEARCH_EDGES.map((edge, index) => (
        <line
          className="story-edge"
          key={index}
          x1={edge.from[0]}
          y1={edge.from[1]}
          x2={edge.to[0]}
          y2={edge.to[1]}
          stroke="url(#search-cost)"
          pathLength="1"
          style={animationStyle(edge.delay)}
        />
      ))}
      {SEARCH_POINTS.map((point) => <Node key={`${point.x}-${point.y}`} point={point} />)}
    </svg>
  );
}

export function SearchStory() {
  const [scene, setScene] = useState<Scene>("linear");
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setScene((current) => current === "linear" ? "search" : "linear");
    }, scene === "linear" ? 5600 : 7600);
    return () => window.clearTimeout(timeout);
  }, [scene, cycle]);

  const replay = () => {
    setScene("linear");
    setCycle((current) => current + 1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    replay();
  };

  return (
    <main
      className={`search-story search-story-${scene}`}
      role="button"
      tabIndex={0}
      aria-label="Replay the animation: game development is shown first as one costly linear path, then as a better search that explores many cheap early branches before narrowing to one late-stage direction."
      onClick={replay}
      onKeyDown={handleKeyDown}
      title="Click to replay"
    >
      <div className="story-ambient" aria-hidden="true" />
      <div className="story-frame" key={`${scene}-${cycle}`}>
        <div className="story-stages" aria-label="Development stages from left to right">
          <div className="story-stage-origin">
            <span className="story-stage-heading">Development stage</span>
            <span className="story-stage-early">Early</span>
          </div>
          <span className="story-stage-middle">Middle</span>
          <span className="story-stage-late">Late</span>
        </div>
        {scene === "linear" ? <LinearScene /> : <SearchScene />}
      </div>
    </main>
  );
}
