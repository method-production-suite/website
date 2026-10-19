// One act on an app's page: a section that pins on a wide screen while you scroll through
// the act, and plays as it comes into view on a narrow one. The copy beside it is plain
// HTML from the server; this island only follows the scroll (src/lib/scrub.ts).
import { useRef } from "react";
import { useScrub } from "../../lib/scrub";
import ScriptAct from "../acts/ScriptAct";
import BoardAct from "../acts/BoardAct";
import BudgetAct, { BUDGET_STEPS } from "../acts/BudgetAct";

const NONE: number[] = [];

interface Props {
  act: "script" | "board" | "budget";
  id: string;
  kicker: string;
  title: string;
  text: string;
}

export default function ActSection({ act, id, kicker, title, text }: Props) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const { step } = useScrub(section, stage, { thresholds: act === "budget" ? BUDGET_STEPS : NONE });
  return (
    <section className="act-section" id={id} aria-labelledby={`${id}-title`} ref={section}>
      <div className="act-stick">
        <div className="act-grid">
          <div className="act-copy">
            <p className="act-kicker">{kicker}</p>
            <h2 id={`${id}-title`}>{title}</h2>
            <p>{text}</p>
          </div>
          <div ref={stage} className="act-holder">
            {act === "script" ? <ScriptAct /> : act === "board" ? <BoardAct /> : <BudgetAct step={step} />}
          </div>
        </div>
      </div>
    </section>
  );
}
