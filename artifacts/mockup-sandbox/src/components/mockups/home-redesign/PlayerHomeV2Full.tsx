// Full-page non-scrolling export for screenshots — same component, no overflow clip
export { PlayerHomeV2 as default } from "./PlayerHomeV2";

import { PlayerHomeV2 as Base } from "./PlayerHomeV2";
import { useState } from "react";

export function PlayerHomeV2Full() {
  return (
    <div style={{ width: 390, background: "#080A0F", fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif" }}>
      <Base />
    </div>
  );
}
