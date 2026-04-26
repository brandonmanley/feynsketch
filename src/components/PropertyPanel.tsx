import { useStore } from "../store";
import type {
  ArrowPosition,
  DiagramObject,
  LineObject,
  LineStyle,
  ShapeKind,
  VertexFill,
  VertexShape,
} from "../types";

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
const SHAPE_KINDS: ShapeKind[] = [
  "circle",
  "ellipse",
  "square",
  "rect",
  "triangle",
  "diamond",
  "cross",
];

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

  const groupSelection = useStore((s) => s.groupSelection);
  const ungroupSelection = useStore((s) => s.ungroupSelection);
  const bringForward = useStore((s) => s.bringForward);
  const sendBackward = useStore((s) => s.sendBackward);
  const bringToFront = useStore((s) => s.bringToFront);
  const sendToBack = useStore((s) => s.sendToBack);

  const selected = objects.filter((o) => selectedIds.includes(o.id));

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
            <li>On a selected line, double-click to add an anchor point; Alt-click to remove one.</li>
            <li>Cmd/Ctrl-C / X / V — copy / cut / paste. Cmd/Ctrl-D — duplicate.</li>
            <li>Cmd/Ctrl-G — group; Shift-Cmd/Ctrl-G — ungroup.</li>
            <li>Cmd/Ctrl-]/[ — bring forward / send backward (add Shift for front/back).</li>
            <li>Cmd/Ctrl-Z / Shift-Cmd/Ctrl-Z — undo / redo.</li>
          </ul>
        </div>
      </div>
    );
  }

  if (selected.length > 1) {
    return (
      <MultiPanel
        selected={selected}
        ids={selectedIds}
        updateGroup={updateGroup}
        beforeSlide={pushHistory}
        removeMany={removeMany}
        groupSelection={groupSelection}
        ungroupSelection={ungroupSelection}
        bringForward={bringForward}
        sendBackward={sendBackward}
        bringToFront={bringToFront}
        sendToBack={sendToBack}
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
        {single.groupId && <span className="badge">grouped</span>}
      </div>

      {single.kind === "line" && <LineEditor line={single} updateOne={updateOne} pushHistory={pushHistory} />}
      {single.kind === "shape" && <ShapeEditor shape={single} updateOne={updateOne} pushHistory={pushHistory} />}
      {single.kind === "vertex" && <VertexEditor vertex={single} updateOne={updateOne} pushHistory={pushHistory} />}
      {single.kind === "label" && <LabelEditor label={single} updateOne={updateOne} pushHistory={pushHistory} />}

      <LayerSection
        ids={[single.id]}
        bringForward={bringForward}
        sendBackward={sendBackward}
        bringToFront={bringToFront}
        sendToBack={sendToBack}
      />

      {single.groupId && (
        <Section title="Grouping">
          <button className="btn" onClick={() => ungroupSelection([single.id])}>
            Ungroup
          </button>
        </Section>
      )}

      <div className="panel-section">
        <button className="btn danger" onClick={() => removeObject(single.id)}>
          Delete
        </button>
      </div>
    </div>
  );
}

function LineEditor({
  line,
  updateOne,
  pushHistory,
}: {
  line: LineObject;
  updateOne: (id: string, patch: Partial<DiagramObject>) => void;
  pushHistory: () => void;
}) {
  const updateObject = useStore((s) => s.updateObject);
  const removeAnchor = useStore((s) => s.removeAnchor);
  const showArrowDirection = line.arrow === "middle" || line.arrow === "end" || line.arrow === "start";
  const interiorAnchorCount = Math.max(0, line.points.length - 2);
  return (
    <>
      <Section title="Line style">
        <div className="grid two">
          {LINE_STYLES.map((s) => (
            <button
              key={s.key}
              className={`chip ${line.style === s.key ? "active" : ""}`}
              onClick={() => updateOne(line.id, { style: s.key })}
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
              className={`chip ${line.arrow === a.key ? "active" : ""}`}
              onClick={() => updateOne(line.id, { arrow: a.key })}
            >
              {a.label}
            </button>
          ))}
        </div>
        {showArrowDirection && (
          <div className="grid two" style={{ marginTop: 6 }}>
            <button
              className={`chip ${line.arrowDirection !== "backward" ? "active" : ""}`}
              onClick={() => updateOne(line.id, { arrowDirection: "forward" })}
            >
              → forward
            </button>
            <button
              className={`chip ${line.arrowDirection === "backward" ? "active" : ""}`}
              onClick={() => updateOne(line.id, { arrowDirection: "backward" })}
            >
              ← backward
            </button>
          </div>
        )}
      </Section>
      <Section title="Color">
        <ColorPicker
          value={line.color}
          onChange={(c) => updateOne(line.id, { color: c })}
        />
      </Section>
      <Section title="Stroke width">
        <SliderRow
          value={line.strokeWidth}
          min={0.5}
          max={8}
          step={0.5}
          beforeSlide={pushHistory}
          onChange={(v) => updateObject(line.id, { strokeWidth: v })}
        />
      </Section>
      {(line.style === "wiggly" || line.style === "curly") && (
        <>
          <Section title="Amplitude">
            <SliderRow
              value={line.amplitude}
              min={2}
              max={30}
              step={0.5}
              beforeSlide={pushHistory}
              onChange={(v) => updateObject(line.id, { amplitude: v })}
            />
          </Section>
          <Section title="Wavelength">
            <SliderRow
              value={line.wavelength}
              min={6}
              max={60}
              step={0.5}
              beforeSlide={pushHistory}
              onChange={(v) => updateObject(line.id, { wavelength: v })}
            />
          </Section>
        </>
      )}
      {line.style === "double" && (
        <Section title="Double-line spacing">
          <SliderRow
            value={line.doubleSpacing ?? 5}
            min={1}
            max={20}
            step={0.5}
            beforeSlide={pushHistory}
            onChange={(v) => updateObject(line.id, { doubleSpacing: v })}
          />
        </Section>
      )}
      <Section title="Anchors">
        <div className="panel-hint">
          Drag the blue handles to reshape. Double-click on the line to add an anchor.
          Alt-click an interior anchor to delete it.
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            className="btn"
            disabled={interiorAnchorCount === 0}
            onClick={() => {
              const next = [line.points[0], line.points[line.points.length - 1]];
              updateOne(line.id, { points: next });
            }}
          >
            Reset to straight
          </button>
          <button
            className="btn"
            disabled={interiorAnchorCount === 0}
            onClick={() => {
              // Remove the last interior anchor
              const idx = line.points.length - 2;
              if (idx > 0) removeAnchor(line.id, idx);
            }}
          >
            Remove last anchor
          </button>
        </div>
        <div className="panel-hint" style={{ marginTop: 6 }}>
          {interiorAnchorCount === 0
            ? "No interior anchors yet."
            : `${interiorAnchorCount} interior anchor${interiorAnchorCount === 1 ? "" : "s"}.`}
        </div>
      </Section>
    </>
  );
}

function ShapeEditor({
  shape,
  updateOne,
  pushHistory,
}: {
  shape: import("../types").ShapeObject;
  updateOne: (id: string, patch: Partial<DiagramObject>) => void;
  pushHistory: () => void;
}) {
  const updateObject = useStore((s) => s.updateObject);
  const isCross = shape.shape === "cross";
  return (
    <>
      <Section title="Shape">
        <div className="grid two">
          {SHAPE_KINDS.map((s) => (
            <button
              key={s}
              className={`chip ${shape.shape === s ? "active" : ""}`}
              onClick={() => updateOne(shape.id, { shape: s })}
            >
              {s}
            </button>
          ))}
        </div>
      </Section>
      <Section title={isCross ? "Color" : "Stroke color"}>
        <ColorPicker value={shape.stroke} onChange={(c) => updateOne(shape.id, { stroke: c })} />
      </Section>
      {!isCross && (
        <Section title="Fill color">
          <ColorPicker
            value={shape.fill}
            onChange={(c) => updateOne(shape.id, { fill: c })}
            allowTransparent
          />
        </Section>
      )}
      <Section title="Width">
        <SliderRow
          value={shape.width}
          min={8}
          max={400}
          step={1}
          beforeSlide={pushHistory}
          onChange={(v) => updateObject(shape.id, { width: v })}
        />
      </Section>
      <Section title="Height">
        <SliderRow
          value={shape.height}
          min={8}
          max={400}
          step={1}
          beforeSlide={pushHistory}
          onChange={(v) => updateObject(shape.id, { height: v })}
        />
      </Section>
      <Section title="Rotation">
        <SliderRow
          value={shape.rotation}
          min={-180}
          max={180}
          step={1}
          beforeSlide={pushHistory}
          onChange={(v) => updateObject(shape.id, { rotation: v })}
        />
      </Section>
      <Section title="Stroke width">
        <SliderRow
          value={shape.strokeWidth}
          min={0}
          max={10}
          step={0.5}
          beforeSlide={pushHistory}
          onChange={(v) => updateObject(shape.id, { strokeWidth: v })}
        />
      </Section>
    </>
  );
}

function VertexEditor({
  vertex,
  updateOne,
  pushHistory,
}: {
  vertex: import("../types").VertexObject;
  updateOne: (id: string, patch: Partial<DiagramObject>) => void;
  pushHistory: () => void;
}) {
  const updateObject = useStore((s) => s.updateObject);
  return (
    <>
      <Section title="Vertex shape">
        <div className="grid two">
          {VERTEX_SHAPES.map((s) => (
            <button
              key={s}
              className={`chip ${vertex.shape === s ? "active" : ""}`}
              onClick={() => updateOne(vertex.id, { shape: s })}
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
              className={`chip ${vertex.fill === f ? "active" : ""}`}
              onClick={() => updateOne(vertex.id, { fill: f })}
            >
              {f}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Color">
        <ColorPicker value={vertex.color} onChange={(c) => updateOne(vertex.id, { color: c })} />
      </Section>
      <Section title="Size">
        <SliderRow
          value={vertex.size}
          min={3}
          max={30}
          step={0.5}
          beforeSlide={pushHistory}
          onChange={(v) => updateObject(vertex.id, { size: v })}
        />
      </Section>
    </>
  );
}

function LabelEditor({
  label,
  updateOne,
  pushHistory,
}: {
  label: import("../types").LabelObject;
  updateOne: (id: string, patch: Partial<DiagramObject>) => void;
  pushHistory: () => void;
}) {
  const updateObject = useStore((s) => s.updateObject);
  return (
    <>
      <Section title="LaTeX source">
        <textarea
          className="textarea"
          rows={3}
          value={label.latex}
          onFocus={pushHistory}
          onChange={(e) => updateObject(label.id, { latex: e.target.value })}
        />
      </Section>
      <Section title="Color">
        <ColorPicker value={label.color} onChange={(c) => updateOne(label.id, { color: c })} />
      </Section>
      <Section title="Font size">
        <SliderRow
          value={label.fontSize}
          min={10}
          max={48}
          step={1}
          beforeSlide={pushHistory}
          onChange={(v) => updateObject(label.id, { fontSize: v })}
        />
      </Section>
      <Section title="Font family">
        <select
          className="select"
          value={label.fontFamily}
          onChange={(e) => updateOne(label.id, { fontFamily: e.target.value })}
        >
          <option value="KaTeX_Main, serif">KaTeX / Serif</option>
          <option value="Inter, system-ui, sans-serif">Sans-serif</option>
          <option value="Georgia, serif">Georgia</option>
          <option value='"Courier New", monospace'>Monospace</option>
        </select>
      </Section>
    </>
  );
}

function LayerSection({
  ids,
  bringForward,
  sendBackward,
  bringToFront,
  sendToBack,
}: {
  ids: string[];
  bringForward: (ids: string[]) => void;
  sendBackward: (ids: string[]) => void;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;
}) {
  return (
    <Section title="Layer order">
      <div className="grid two">
        <button className="chip" onClick={() => bringForward(ids)}>
          Bring forward
        </button>
        <button className="chip" onClick={() => sendBackward(ids)}>
          Send backward
        </button>
        <button className="chip" onClick={() => bringToFront(ids)}>
          Bring to front
        </button>
        <button className="chip" onClick={() => sendToBack(ids)}>
          Send to back
        </button>
      </div>
    </Section>
  );
}

function MultiPanel({
  selected,
  ids,
  updateGroup,
  beforeSlide,
  removeMany,
  groupSelection,
  ungroupSelection,
  bringForward,
  sendBackward,
  bringToFront,
  sendToBack,
}: {
  selected: DiagramObject[];
  ids: string[];
  updateGroup: (ids: string[], patcher: (o: DiagramObject) => Partial<DiagramObject>) => void;
  beforeSlide: () => void;
  removeMany: (ids: string[]) => void;
  groupSelection: (ids: string[]) => void;
  ungroupSelection: (ids: string[]) => void;
  bringForward: (ids: string[]) => void;
  sendBackward: (ids: string[]) => void;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;
}) {
  const updateMany = useStore((s) => s.updateMany);
  const allSameKind = selected.every((o) => o.kind === selected[0].kind);
  const allLines = selected.every((o) => o.kind === "line");
  const allShapes = selected.every((o) => o.kind === "shape");
  const allVertices = selected.every((o) => o.kind === "vertex");
  const colors = new Set(selected.map(colorOf));
  const sharedColor = colors.size === 1 ? Array.from(colors)[0] : "";
  const groupIds = new Set(selected.map((o) => o.groupId).filter(Boolean));
  const allInOneGroup = groupIds.size === 1 && selected.every((o) => o.groupId);
  const someGrouped = selected.some((o) => o.groupId);

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
          <div className="grid two" style={{ marginTop: 6 }}>
            <button
              className="chip"
              onClick={() => updateGroup(ids, () => ({ arrowDirection: "forward" }) as Partial<DiagramObject>)}
            >
              → forward
            </button>
            <button
              className="chip"
              onClick={() => updateGroup(ids, () => ({ arrowDirection: "backward" }) as Partial<DiagramObject>)}
            >
              ← backward
            </button>
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

      <Section title="Grouping">
        <div className="grid two">
          <button
            className="chip"
            disabled={selected.length < 2 || allInOneGroup}
            onClick={() => groupSelection(ids)}
          >
            Group
          </button>
          <button
            className="chip"
            disabled={!someGrouped}
            onClick={() => ungroupSelection(ids)}
          >
            Ungroup
          </button>
        </div>
      </Section>

      <LayerSection
        ids={ids}
        bringForward={bringForward}
        sendBackward={sendBackward}
        bringToFront={bringToFront}
        sendToBack={sendToBack}
      />

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
