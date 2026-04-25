import { useStore } from "../store";
import type { ArrowPosition, LineStyle, ShapeKind, VertexFill, VertexShape } from "../types";

const LINE_STYLES: { key: LineStyle; label: string }[] = [
  { key: "solid", label: "Solid" },
  { key: "dashed", label: "Dashed" },
  { key: "ghost", label: "Dotted (ghost)" },
  { key: "double", label: "Double" },
  { key: "wiggly", label: "Wiggly (photon)" },
  { key: "curly", label: "Curly (gluon)" },
];

const ARROWS: { key: ArrowPosition; label: string }[] = [
  { key: "none", label: "None" },
  { key: "start", label: "Start" },
  { key: "middle", label: "Middle" },
  { key: "end", label: "End" },
];

const VERTEX_SHAPES: VertexShape[] = ["circle", "square"];
const VERTEX_FILLS: VertexFill[] = ["filled", "open", "none"];
const SHAPE_KINDS: ShapeKind[] = ["circle", "ellipse", "square", "rect", "triangle", "diamond"];

export function PropertyPanel() {
  const objects = useStore((s) => s.objects);
  const selectedId = useStore((s) => s.selectedId);
  const updateObject = useStore((s) => s.updateObject);
  const removeObject = useStore((s) => s.removeObject);

  const selected = objects.find((o) => o.id === selectedId);

  if (!selected) {
    return (
      <div className="panel">
        <div className="panel-title">Properties</div>
        <div className="panel-hint">Select an object to edit its properties.</div>
        <div className="panel-section">
          <div className="panel-subtitle">Tips</div>
          <ul className="tips">
            <li>Click an object to select it.</li>
            <li>Drag to move. Drag handles to resize.</li>
            <li>On a selected line, double-click to add an anchor point.</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-title">
        {selected.kind === "line" && "Line"}
        {selected.kind === "shape" && "Shape"}
        {selected.kind === "vertex" && "Vertex"}
        {selected.kind === "label" && "Label"}
      </div>

      {selected.kind === "line" && (
        <>
          <Section title="Line style">
            <div className="grid two">
              {LINE_STYLES.map((s) => (
                <button
                  key={s.key}
                  className={`chip ${selected.style === s.key ? "active" : ""}`}
                  onClick={() => updateObject(selected.id, { style: s.key })}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Arrow">
            <div className="grid two">
              {ARROWS.map((a) => (
                <button
                  key={a.key}
                  className={`chip ${selected.arrow === a.key ? "active" : ""}`}
                  onClick={() => updateObject(selected.id, { arrow: a.key })}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Color">
            <ColorPicker
              value={selected.color}
              onChange={(c) => updateObject(selected.id, { color: c })}
            />
          </Section>
          <Section title="Stroke width">
            <SliderRow
              value={selected.strokeWidth}
              min={0.5}
              max={8}
              step={0.5}
              onChange={(v) => updateObject(selected.id, { strokeWidth: v })}
            />
          </Section>
          {(selected.style === "wiggly" || selected.style === "curly") && (
            <>
              <Section title="Amplitude">
                <SliderRow
                  value={selected.amplitude}
                  min={2}
                  max={30}
                  step={0.5}
                  onChange={(v) => updateObject(selected.id, { amplitude: v })}
                />
              </Section>
              <Section title="Wavelength">
                <SliderRow
                  value={selected.wavelength}
                  min={8}
                  max={60}
                  step={0.5}
                  onChange={(v) => updateObject(selected.id, { wavelength: v })}
                />
              </Section>
            </>
          )}
          <Section title="Anchors">
            <div className="panel-hint">
              Drag the blue handles to reshape. Double-click on the line to add an anchor.
            </div>
            <button
              className="btn"
              onClick={() => {
                const next = [selected.points[0], selected.points[selected.points.length - 1]];
                updateObject(selected.id, { points: next });
              }}
            >
              Reset to straight
            </button>
          </Section>
        </>
      )}

      {selected.kind === "shape" && (
        <>
          <Section title="Shape">
            <div className="grid two">
              {SHAPE_KINDS.map((s) => (
                <button
                  key={s}
                  className={`chip ${selected.shape === s ? "active" : ""}`}
                  onClick={() => updateObject(selected.id, { shape: s })}
                >
                  {s}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Stroke color">
            <ColorPicker value={selected.stroke} onChange={(c) => updateObject(selected.id, { stroke: c })} />
          </Section>
          <Section title="Fill color">
            <ColorPicker
              value={selected.fill}
              onChange={(c) => updateObject(selected.id, { fill: c })}
              allowTransparent
            />
          </Section>
          <Section title="Width">
            <SliderRow
              value={selected.width}
              min={8}
              max={400}
              step={1}
              onChange={(v) => updateObject(selected.id, { width: v })}
            />
          </Section>
          <Section title="Height">
            <SliderRow
              value={selected.height}
              min={8}
              max={400}
              step={1}
              onChange={(v) => updateObject(selected.id, { height: v })}
            />
          </Section>
          <Section title="Rotation">
            <SliderRow
              value={selected.rotation}
              min={-180}
              max={180}
              step={1}
              onChange={(v) => updateObject(selected.id, { rotation: v })}
            />
          </Section>
          <Section title="Stroke width">
            <SliderRow
              value={selected.strokeWidth}
              min={0}
              max={10}
              step={0.5}
              onChange={(v) => updateObject(selected.id, { strokeWidth: v })}
            />
          </Section>
        </>
      )}

      {selected.kind === "vertex" && (
        <>
          <Section title="Vertex shape">
            <div className="grid two">
              {VERTEX_SHAPES.map((s) => (
                <button
                  key={s}
                  className={`chip ${selected.shape === s ? "active" : ""}`}
                  onClick={() => updateObject(selected.id, { shape: s })}
                >
                  {s}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Fill">
            <div className="grid two">
              {VERTEX_FILLS.map((f) => (
                <button
                  key={f}
                  className={`chip ${selected.fill === f ? "active" : ""}`}
                  onClick={() => updateObject(selected.id, { fill: f })}
                >
                  {f}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Color">
            <ColorPicker value={selected.color} onChange={(c) => updateObject(selected.id, { color: c })} />
          </Section>
          <Section title="Size">
            <SliderRow
              value={selected.size}
              min={3}
              max={30}
              step={0.5}
              onChange={(v) => updateObject(selected.id, { size: v })}
            />
          </Section>
        </>
      )}

      {selected.kind === "label" && (
        <>
          <Section title="LaTeX source">
            <textarea
              className="textarea"
              rows={3}
              value={selected.latex}
              onChange={(e) => updateObject(selected.id, { latex: e.target.value })}
            />
          </Section>
          <Section title="Color">
            <ColorPicker value={selected.color} onChange={(c) => updateObject(selected.id, { color: c })} />
          </Section>
          <Section title="Font size">
            <SliderRow
              value={selected.fontSize}
              min={10}
              max={48}
              step={1}
              onChange={(v) => updateObject(selected.id, { fontSize: v })}
            />
          </Section>
          <Section title="Font family">
            <select
              className="select"
              value={selected.fontFamily}
              onChange={(e) => updateObject(selected.id, { fontFamily: e.target.value })}
            >
              <option value="KaTeX_Main, serif">KaTeX / Serif</option>
              <option value="Inter, system-ui, sans-serif">Sans-serif</option>
              <option value="Georgia, serif">Georgia</option>
              <option value='"Courier New", monospace'>Monospace</option>
            </select>
          </Section>
        </>
      )}

      <div className="panel-section">
        <button className="btn danger" onClick={() => removeObject(selected.id)}>
          Delete
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel-section">
      <div className="panel-subtitle">{title}</div>
      {children}
    </div>
  );
}

function SliderRow({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="slider-row">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        className="num"
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number(value.toFixed(2))}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
  allowTransparent,
}: {
  value: string;
  onChange: (c: string) => void;
  allowTransparent?: boolean;
}) {
  const swatches = ["#111111", "#ffffff", "#e53e3e", "#dd6b20", "#d69e2e", "#38a169", "#3182ce", "#805ad5", "#d53f8c"];
  const isTransparent = value === "transparent" || value === "none";
  return (
    <div className="color-row">
      <input
        type="color"
        value={isTransparent ? "#ffffff" : value}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        className="text"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {allowTransparent && (
        <button
          className={`chip ${isTransparent ? "active" : ""}`}
          onClick={() => onChange("transparent")}
        >
          none
        </button>
      )}
      <div className="swatches">
        {swatches.map((c) => (
          <button
            key={c}
            className="swatch"
            style={{ background: c }}
            onClick={() => onChange(c)}
            aria-label={c}
          />
        ))}
      </div>
    </div>
  );
}
