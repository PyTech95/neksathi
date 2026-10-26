import { VEHICLE_BRANDS, VEHICLE_COLORS } from "@/lib/vehicleData";

// Reusable Brand → Model (dependent) + Colour pickers with an "Other / not
// listed" escape so any value can still be typed. Used by the add/edit vehicle
// forms. `value` is {brand, model, color}; `onChange(patch)` merges a partial.
//
// Sentinel: picking "Other" sets the field to a single space " " so the text
// input appears; callers should trim brand/model/color before submitting
// (use `tidyVehicle`).

const OTHER = "__other__";

function SelectOrOther({ list, value, onChange, placeholder, otherPlaceholder, testid }) {
  const known = list.includes(value);
  const isOther = value !== "" && !known;
  return (
    <>
      <select
        className="input"
        value={known ? value : isOther ? OTHER : ""}
        data-testid={testid}
        onChange={(e) => onChange(e.target.value === OTHER ? " " : e.target.value)}
      >
        <option value="">{placeholder}</option>
        {list.map((x) => <option key={x} value={x}>{x}</option>)}
        <option value={OTHER}>Other / not listed</option>
      </select>
      {isOther && (
        <input
          className="input"
          style={{ marginTop: 6 }}
          placeholder={otherPlaceholder}
          value={value === " " ? "" : value}
          data-testid={`${testid}-other`}
          onChange={(e) => onChange(e.target.value === "" ? " " : e.target.value)}
        />
      )}
    </>
  );
}

export default function VehicleFields({ value, onChange, idPrefix = "veh", labels = true }) {
  const brand = value?.brand || "";
  const model = value?.model || "";
  const color = value?.color || "";
  const brandKeys = Object.keys(VEHICLE_BRANDS);
  const knownBrand = brandKeys.includes(brand);
  const models = knownBrand ? VEHICLE_BRANDS[brand] : [];
  const Lbl = ({ children }) => (labels ? <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>{children}</div> : null);

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <Lbl>Brand</Lbl>
        <SelectOrOther
          list={brandKeys} value={brand} placeholder="Select brand…" otherPlaceholder="Type brand name"
          testid={`${idPrefix}-brand`} onChange={(b) => onChange({ brand: b, model: "" })}
        />
      </div>
      <div style={{ marginBottom: 10 }}>
        <Lbl>Model</Lbl>
        {knownBrand ? (
          <SelectOrOther
            list={models} value={model} placeholder="Select model…" otherPlaceholder="Type model"
            testid={`${idPrefix}-model`} onChange={(m) => onChange({ model: m })}
          />
        ) : (
          <input
            className="input" placeholder="Model (e.g. Scorpio)"
            value={model === " " ? "" : model} data-testid={`${idPrefix}-model`}
            onChange={(e) => onChange({ model: e.target.value })}
          />
        )}
      </div>
      <div style={{ marginBottom: 10 }}>
        <Lbl>Colour</Lbl>
        <select className="input" value={color} data-testid={`${idPrefix}-color`} onChange={(e) => onChange({ color: e.target.value })}>
          <option value="">Select colour…</option>
          {VEHICLE_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    </>
  );
}

// Trim the " " sentinels before sending to the API.
export function tidyVehicle(v) {
  const t = (x) => (x || "").trim();
  return { brand: t(v?.brand) || null, model: t(v?.model) || null, color: t(v?.color) || null };
}
