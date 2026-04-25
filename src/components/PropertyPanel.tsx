import { useStore } from "../store";
import type { ArrowPosition, DiagramObject, LineStyle, ShapeKind, VertexFill, VertexShape } from "../types";

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

function colorOf(o: DiagramObject): string {
  if (o.kind === "shape") return o.stroke;
  if (o.kind === "line" || o.kind === "vertex" || o.kind === "label") return o.color;
  return "#111111";
}

function applyColor(o: DiagramObject, color: string): Partial<DiagramObject> {
  if (o.kind === "shape") return { stroke: color } as Partial<DiagramObject>;
  return { color } as Partial<DiagramObject>;
}

export function PropertyPanel() {
  const objects = useStore((s) => s.objects);
  const selectedIds = useStore((s) => s.selectedIds);
  const updateObject = useStore((s) => s.updateObject);
  const updateMany = useStore((s) => s.updateMany);
  const removeObject = useStore((s) => s.removeObject);
  const removeMany = useStore((s) => s.removeMany);
  const pushHistory = useStore((s) => s.pushHistory);

  const selected = objects.filter((o) => selectedIds.includes(o.id));

  // Wrappers that record an undo step before applying the change.
  const updateOne = (id: string, patch: Partial<DiagramObject>) => {
    pushHistory();
    updateObject(id, patch);
  };
  const updateGroup = (ids: string[], patcher: (o: DiagramObject) => Partial<DiagramObject>) => {
    pushHistory();
    updateMany(ids, patcher);
  };

  if (selected.length === 0) {
    return (
      <div className="panel">
        <div className="panel-title">Properties</div>
        <div className="panel-hint">Select an object to edit its properties.</div>
        <div className="panel-section">
          <div className="panel-subtitle">Tips</div>
          <ul className="tips">
            <li>Click an object to select it.</li>
            <li>Drag from empty space to box-select multiple objects.</li>
            <li>Hold Shift to add/remove from a selection.</li>
            <li>Drag to move. Drag handles to resize.</li>
            <li>On a selected line, double-click to add an anchor point.</li>
            <li>Backspace or Delete removes the selected objects.</li>
            <li>Cmd/Ctrl-Z to undo, Shift-Cmd/Ctrl-Z to redo.</li>
          </ul>
        </div>
      </div>
    );
  }

  if (selected.length > 1) {
    return (
      <MultiPanel
        selected={selected}
        updateGroup={updateGroup}
        beforeSlide={pushHistory}
        removeMany={removeMany}
      />
    );
  }

  const single = selected[0];

  return (
    <div className="panel">
      <div className="panel-title">
        {single.kind === "line" && "Line"}
        {single.kind === "shape" && "Shape"}
        {single.kind === "vertex" && "Vertex"}
        {single.kind === "label" && "Label"}
      </div>

      {single.kind === "line" && (
        <>
          <Section title="Line style">
            <div className="grid two">
              {LINE_STYLES.map((s) => (
                <button
                  key={s.key}
                  className={`chip ${single.style === s.key ? "active" : ""}`}
                  onClick={() => updateOne(single.id, { style: s.key })}
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
                  className={`chip ${single.arrow === a.key ? "active" : ""}`}
                  onClick={() => updateOne(single.id, { arrow: a.key })}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Color">
            <ColorPicker
              value={single.color}
              onChange={(c) => updateOne(single.id, { color: c })}
            />
          </Section>
          <Section title="Stroke width">
            <SliderRow
              value={single.strokeWidth}
              min={0.5}
              max={8}
              step={0.5}
              beforeSlide={pushHistory}
              onChange={(v) => updateObject(single.id, { strokeWidth: v })}
            />
          </Section>
          {(single.style === "wiggly" || single.style === "curly") && (
            <>
              <Section title="Amplitude">
                <SliderRow
                  value={single.amplitude}
                  min={2}
                  max={30}
                  step={0.5}
                  beforeSlide={pushHistory}
                  onChange={(v) => updateObject(single.id, { amplitude: v })}
                />
              </Section>
              <Section title="Wavelength">
                <SliderRow
                  value={single.wavelength}
                  min={8}
                  max={60}
                  step={0.5}
                  beforeSlide={pushHistory}
                  onChange={(v) => updateObject(single.id, { wavelength: v })}
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
                const next = [single.points[0], single.points[single.points.length - 1]];
                updateOne(single.id, { points: next });
              }}
            >
              Reset to straight
            </button>
          </Section>
        </>
      )}

      {single.kind === "shape" && (
        <>
          <Section title="Shape">
            <div className="grid two">
              {SHAPE_KINDS.map((s) => (
                <button
                  key={s}
                  className={`chip ${single.shape === s ? "active" : ""}`}
                  onClick={() => updateOne(single.id, { shape: s })}
                >
                  {s}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Stroke color">
            <ColorPicker value={single.stroke} onChange={(c) => updateOne(single.id, { stroke: c })} />
          </Section>
          <Section title="Fill color">
            <ColorPicker
              value={single.fill}
              onChange={(c) => updateOne(single.id, { fill: c })}
              allowTransparent
            />
          </Section>
          <Section title="Width">
            <SliderRow
              value={single.width}
              min={8}
              max={400}
              step={1}
              beforeSlide={pushHistory}
              onChange={(v) => updateObject(single.id, { width: v })}
            />
          </Section>
          <Section title="Height">
            <SliderRow
              value={single.height}
              min={8}
              max={400}
              step={1}
              beforeSlide={pushHistory}
              onChange={(v) => updateObject(single.id, { height: v })}
            />
          </Section>
          <Section title="Rotation">
            <SliderRow
              value={single.rotation}
              min={-180}
              max={180}
              step={1}
              beforeSlide={pushHistory}
              onChange={(v) => updateObject(single.id, { rotation: v })}
            />
          </Section>
          <Section title="Stroke width">
            <SliderRow
              value={single.strokeWidth}
              min={0}
              max={10}
              step={0.5}
              beforeSlide={pushHistory}
              onChange={(v) => updateObject(single.id, { strokeWidth: v })}
            />
          </Section>
        </>
      )}

      {single.kind === "vertex" && (
        <>
          <Section title="Vertex shape">
            <div className="grid two">
              {VERTEX_SHAPES.map((s) => (
                <button
                  key={s}
                  className={`chip ${single.shape === s ? "active" : ""}`}
                  onClick={() => updateOne(single.id, { shape: s })}
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
                  className={`chip ${single.fill === f ? "active" : ""}`}
                  onClick={() => updateOne(single.id, { fill: f })}
                >
                  {f}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Color">
            <ColorPicker value={single.color} onChange={(c) => updateOne(single.id, { color: c })} />
          </Section>
          <Section title="Size">
            <SliderRow
              value={single.size}
              min={3}
              max={30}
              step={0.5}
              beforeSlide={pushHistory}
              onChange={(v) => updateObject(single.id, { size: v })}
            />
          </Section>
        </>
      )}

      {single.kind === "label" && (
        <>
          <Section title="LaTeX source">
            <textarea
              className="textarea"
              rows={3}
              value={single.latex}
              onFocus={pushHistory}
              onChange={(e) => updateObject(single.id, { latex: e.target.value })}
            />
          </Section>
          <Section title="Color">
            <ColorPicker value={single.color} onChange={(c) => updateOne(single.id, { color: c })} />
          </Section>
          <Section title="Font size">
            <SliderRow
              value={single.fontSize}
              min={10}
              max={48}
              step={1}
              beforeSlide={pushHistory}
              onChange={(v) => updateObject(single.id, { fontSize: v })}
            />
          </Section>
          <Section title="Font family">
            <select
              className="select"
              value={single.fontFamily}
              onChange={(e) => updateOne(single.id, { fontFamily: e.target.value })}
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
        <button className="btn danger" onClick={() => removeObject(single.id)}>
          Delete
        </button>
      </div>
    </div>
  );
}

function MultiPanel({
  selected,
  updateGroup,
  beforeSlide,
  removeMany,
}: {
  selected: DiagramObject[];
  updateGroup: (ids: string[], patcher: (o: DiagramObject) => Partial<DiagramObject>) => void;
  beforeSlide: () => void;
  removeMany: (ids: string[]) => void;
}) {
  const updateMany = useStore((s) => s.updateMany);
  const ids = selected.map((o) => o.id);
  const allSameKind = selected.every((o) => o.kind === selected[0].kind);
  const allLines = selected.every((o) => o.kind === "line");
  const allShapes = selected.every((o) => o.kind === "shape");
  const allVertices = selected.every((o) => o.kind === "vertex");
  const colors = new Set(selected.map(colorOf));
  const sharedColor = colors.size === 1 ? Array.from(colors)[0] : "";

  return (
    <div className="panel">
      <div className="panel-title">{selected.length} objects selected</div>
      <div className="panel-hint">
        Only properties shared by every selected object are shown.
      </div>

      <Section title="Color">
        <ColorPicker
          value={sharedColor || "#111111"}
          placeholder={sharedColor ? undefined : "(mixed)"}
          onChange={(c) => updateGroup(ids, (o) => applyColor(o, c))}
        />
      </Section>

      {(allLines || allShapes) && (
        <Section title="Stroke width">
          <SliderRow
            value={(selected[0] as any).strokeWidth}
            min={0}
            max={10}
            step={0.5}
            beforeSlide={beforeSlide}
            onChange={(v) =>
              updateMany(ids, (o) => {
                if (o.kind === "line" || o.kind === "shape") return { strokeWidth: v } as Partial<DiagramObject>;
                return {};
              })
            }
          />
        </Section>
      )}

      {allLines && (
        <Section title="Line style">
          <div className="grid two">
            {LINE_STYLES.map((s) => (
              <button
                key={s.key}
                className="chip"
                onClick={() => updateGroup(ids, () => ({ style: s.key }) as Partial<DiagramObject>)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Section>
      )}

      {allLines && (
        <Section title="Arrow">
          <div className="grid two">
            {ARROWS.map((a) => (
              <button
                key={a.key}
                className="chip"
                onClick={() => updateGroup(ids, () => ({ arrow: a.key }) as Partial<DiagramObject>)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </Section>
      )}

      {allVertices && (
        <>
          <Section title="Vertex shape">
            <div className="grid two">
              {VERTEX_SHAPES.map((s) => (
                <button
                  key={s}
                  className="chip"
                  onClick={() => updateGroup(ids, () => ({ shape: s }) as Partial<DiagramObject>)}
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
                  className="chip"
                  onClick={() => updateGroup(ids, () => ({ fill: f }) as Partial<DiagramObject>)}
                >
                  {f}
                </button>
              ))}
            </div>
          </Section>
        </>
      )}

      {!allSameKind && (
        <div className="panel-section">
          <div className="panel-hint">
            Mixed object types — use the marquee or shift+click to refine the selection.
          </div>
        </div>
      )}

      <div className="panel-section">
        <button className="btn danger" onClick={() => removeMany(ids)}>
          Delete {selected.length} objects
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
  beforeSlide,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  beforeSlide?: () => void;
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
        onPointerDown={() => beforeSlide?.()}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        className="num"
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number(value.toFixed(2))}
        onFocus={() => beforeSlide?.()}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
  allowTransparent,
  placeholder,
}: {
  value: string;
  onChange: (c: string) => void;
  allowTransparent?: boolean;
  placeholder?: string;
}) {
  const swatches = ["#111111", "#ffffff", "#e53e3e", "#dd6b20", "#d69e2e", "#38a169", "#3182ce", "#805ad5", "#d53f8c"];
  const isTransparent = value === "transparent" || value === "none";
  return (
    <div className="color-row">
      <input
        type="color"
        value={isTransparent ? "#ffffff" : value || "#111111"}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        className="text"
        type="text"
        value={value}
        placeholder={placeholder}
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
