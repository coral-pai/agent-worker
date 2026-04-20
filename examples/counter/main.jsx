import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import htm from "htm";

const html = htm.bind(React.createElement);

function App() {
  const [count, setCount] = useState(12);
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState("up");

  useEffect(() => {
    const body = document.body;
    body.dataset.direction = direction;
    return () => {
      delete body.dataset.direction;
    };
  }, [direction]);

  const updateCount = (delta) => {
    setDirection(delta >= 0 ? "up" : "down");
    setCount((value) => value + delta);
  };

  const reset = () => {
    setDirection("up");
    setCount(0);
  };

  const energy = Math.min(100, Math.max(0, 50 + count * 4));

  return html`
    <main className="shell">
      <section className="panel">
        <div className="panel__header">
          <p className="eyebrow">Linear Ticket Demo</p>
          <h1>Prism Counter</h1>
          <p className="lede">
            반응형 애니메이션과 레이어드 그래픽으로 구성한 React 카운터입니다.
          </p>
        </div>

        <div className="meter">
          <div className="meter__ring" style=${{ "--energy": `${energy}%` }}></div>
          <div className="meter__content">
            <span className="meter__label">Current Value</span>
            <strong key=${count} className="meter__value">
              ${count}
            </strong>
            <span className="meter__step">Step ${step}</span>
          </div>
        </div>

        <div className="controls" aria-label="counter controls">
          <button className="button button--ghost" onClick=${() => updateCount(-step)}>
            감소
          </button>
          <button className="button" onClick=${() => updateCount(step)}>
            증가
          </button>
        </div>

        <div className="stepper" role="group" aria-label="step selection">
          ${[1, 2, 5, 10].map(
            (value) => html`
              <button
                key=${value}
                className=${`chip${step === value ? " chip--active" : ""}`}
                onClick=${() => setStep(value)}
              >
                +${value}
              </button>
            `
          )}
          <button className="chip chip--reset" onClick=${reset}>
            Reset
          </button>
        </div>

        <div className="stats">
          <article className="stat">
            <span>Energy</span>
            <strong>${energy}%</strong>
          </article>
          <article className="stat">
            <span>Direction</span>
            <strong>${direction === "up" ? "Ascending" : "Descending"}</strong>
          </article>
        </div>
      </section>
    </main>
  `;
}

createRoot(document.getElementById("root")).render(React.createElement(App));
