import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { SearchStory } from "./search-story";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");

createRoot(root).render(
  <StrictMode>
    {window.location.pathname === "/story" ? <SearchStory /> : <App />}
  </StrictMode>,
);
