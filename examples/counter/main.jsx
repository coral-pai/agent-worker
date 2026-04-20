import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import htm from "htm";

const html = htm.bind(React.createElement);
const presets = [1, 3, 5, 8];

function App() {
  const [count, setCount] = useState(28);
  const [step, setStep] = useState(3);
  const [direction, setDirection] = useState("up");
  const [history, setHistory] = useState([11, 16, 19, 25, 28]);

  useEffect(() => {
    const body = document.body;
    body.dataset.direction = direction;

    return () => {
      delete body.dataset.direction;
    };
  }, [direction]);

  const updateCount = (delta) => {
    setDirection(delta >= 0 ? "up" : "down");
    setCount((value) => {
      const next = value + delta;
      setHistory((entries) => [...entries.slice(-4), next]);
      return next;
    });
  };

  const reset = () => {
    setDirection("up");
    setCount(0);
    setHistory((entries) => [...entries.slice(-4), 0]);
  };

  const intensity = Math.min(100, Math.max(8, 35 + count * 2.6));
  const balance = Math.min(100, Math.max(0, 50 + count * 1.4));
  const mood =
    count >= 60 ? "Overdrive" : count >= 30 ? "Elevated" : count >= 0 ? "Stable" : "Below Zero";

  return html`
    <main className="shell">
      <section className="hero">
        <div className="hero__copy">
          <div className="hero__text">
            <p className="eyebrow">Linear Ticket Demo</p>
            <h1>Pulse Counter</h1>
            <p className="lede">
              타이포그래피, 네온 글로우, 데이터 패널을 겹쳐서 만든 React 카운터입니다.
            </p>
          </div>

          <div className="hero__stats">
            <article className="stat">
              <span>Intensity</span>
              <strong>${intensity}%</strong>
            </article>
            <article className="stat">
              <span>Mood</span>
              <strong>${mood}</strong>
            </article>
          </div>
        </div>

        <div className="stage">
          <div className="orb" style=${{ "--intensity": `${intensity}%` }}></div>
          <div className="stage__panel">
            <span className="stage__label">Current Value</span>
            <strong key=${count} className="stage__value">
              ${count}
            </strong>
            <span className="stage__direction">
              ${direction === "up" ? "Ascending now" : "Descending now"}
            </span>
          </div>
        </div>

        <div className="console">
          <div className="console__group" aria-label="counter controls">
            <button className="button button--soft" onClick=${() => updateCount(-step)}>
              감소
            </button>
            <button className="button" onClick=${() => updateCount(step)}>
              증가
            </button>
          </div>

          <div className="console__group console__group--wrap" role="group" aria-label="step selection">
            ${presets.map(
              (value) => html`
                <button
                  key=${value}
                  className=${`chip${step === value ? " chip--active" : ""}`}
                  onClick=${() => setStep(value)}
                >
                  Step ${value}
                </button>
              `
            )}
            <button className="chip chip--reset" onClick=${reset}>
              Reset
            </button>
          </div>

          <div className="metrics">
            <article className="metric">
              <span>Balance</span>
              <strong>${balance}%</strong>
              <div className="track" aria-hidden="true">
                <i style=${{ width: `${balance}%` }}></i>
              </div>
            </article>
            <article className="metric">
              <span>Recent</span>
              <div className="history" aria-label="recent counter history">
                ${history.map(
                  (value, index) => html`
                    <span
                      key=${`${value}-${index}`}
                      className=${index === history.length - 1 ? "history__pill history__pill--active" : "history__pill"}
                    >
                      ${value}
                    </span>
                  `
                )}
              </div>
            </article>
          </div>
        </div>
      </section>
    </main>
  `;
}

createRoot(document.getElementById("root")).render(React.createElement(App));
