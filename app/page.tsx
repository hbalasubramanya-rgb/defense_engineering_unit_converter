"use client";

import { useEffect, useMemo, useState } from "react";

type ThemeMode = "dark" | "light";

type CategoryKey =
  | "pressure"
  | "temperature"
  | "flow_rate"
  | "torque"
  | "force"
  | "length"
  | "mass"
  | "power"
  | "electrical"
  | "vibration"
  | "surface_finish"
  | "hardness"
  | "thermal_conductivity";

type CategoryKind = "linear" | "temperature" | "hardness";

type UnitDefinition = {
  label: string;
  symbol: string;
  description: string;
  toBase?: number;
  group?: string;
};

type CategoryDefinition = {
  label: string;
  kind: CategoryKind;
  baseUnit?: string;
  defaultFrom: string;
  defaultTo: string;
  units: Record<string, UnitDefinition>;
  constants: Array<{ label: string; value: string; note: string }>;
  disclaimer?: string;
};

type RecentEntry = {
  id: string;
  category: CategoryKey;
  input: string;
  output: string;
  fromUnit: string;
  toUnit: string;
  precision: number;
  note?: string;
};

type FavoriteEntry = {
  id: string;
  category: CategoryKey;
  fromUnit: string;
  toUnit: string;
};

type ConversionResult = {
  value: number | null;
  approximate?: boolean;
  error?: string;
};

type AppState = {
  category: CategoryKey;
  inputValue: string;
  fromUnit: string;
  toUnit: string;
  precision: number;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const PRECISION_OPTIONS = [2, 4, 6, 8];
const SESSION_RECENTS_KEY = "cw-unit-converter-recents";
const LOCAL_FAVORITES_KEY = "cw-unit-converter-favorites";
const THEME_STORAGE_KEY = "cw-unit-converter-theme";

const HARDNESS_TABLE = [
  { hrc: 20, hbw: 223, hv: 234 },
  { hrc: 25, hbw: 255, hv: 266 },
  { hrc: 30, hbw: 286, hv: 302 },
  { hrc: 35, hbw: 327, hv: 345 },
  { hrc: 40, hbw: 375, hv: 392 },
  { hrc: 45, hbw: 429, hv: 455 },
  { hrc: 50, hbw: 496, hv: 513 },
  { hrc: 55, hbw: 584, hv: 595 },
  { hrc: 60, hbw: 653, hv: 697 },
  { hrc: 62, hbw: 674, hv: 746 },
  { hrc: 65, hbw: 739, hv: 832 },
];

const CATEGORY_CONFIGS: Record<CategoryKey, CategoryDefinition> = {
  pressure: {
    label: "Pressure",
    kind: "linear",
    baseUnit: "pa",
    defaultFrom: "psi",
    defaultTo: "bar",
    units: {
      pa: {
        label: "Pascal",
        symbol: "Pa",
        toBase: 1,
        description: "SI base pressure unit",
      },
      kpa: {
        label: "Kilopascal",
        symbol: "kPa",
        toBase: 1_000,
        description: "Common engineering field unit",
      },
      mpa: {
        label: "Megapascal",
        symbol: "MPa",
        toBase: 1_000_000,
        description: "Structural and hydraulic systems",
      },
      bar: {
        label: "Bar",
        symbol: "bar",
        toBase: 100_000,
        description: "Process and instrumentation pressure",
      },
      atm: {
        label: "Standard atmosphere",
        symbol: "atm",
        toBase: 101_325,
        description: "Reference atmosphere",
      },
      psi: {
        label: "Pounds per square inch",
        symbol: "psi",
        toBase: 6_894.757293168,
        description: "Imperial mechanical pressure unit",
      },
      mmhg: {
        label: "Millimeters of mercury",
        symbol: "mmHg",
        toBase: 133.322387415,
        description: "Vacuum and instrument reference",
      },
      inhg: {
        label: "Inches of mercury",
        symbol: "inHg",
        toBase: 3_386.38815789,
        description: "Aviation and weather reference",
      },
    },
    constants: [
      {
        label: "Standard atmosphere",
        value: "101,325 Pa",
        note: "Sea-level reference pressure",
      },
      {
        label: "1 bar",
        value: "100,000 Pa",
        note: "Process control baseline",
      },
      {
        label: "1 psi",
        value: "6,894.757293 Pa",
        note: "Exact conversion basis",
      },
      {
        label: "Water column gradient",
        value: "9.80665 kPa/m",
        note: "Approximate hydrostatic rise per meter",
      },
    ],
  },
  temperature: {
    label: "Temperature",
    kind: "temperature",
    defaultFrom: "c",
    defaultTo: "f",
    units: {
      c: {
        label: "Celsius",
        symbol: "deg C",
        description: "Metric engineering temperature scale",
      },
      f: {
        label: "Fahrenheit",
        symbol: "deg F",
        description: "Imperial temperature scale",
      },
      k: {
        label: "Kelvin",
        symbol: "K",
        description: "Absolute thermodynamic scale",
      },
      r: {
        label: "Rankine",
        symbol: "deg R",
        description: "Absolute imperial temperature scale",
      },
    },
    constants: [
      {
        label: "Absolute zero",
        value: "0 K",
        note: "-273.15 deg C and -459.67 deg F",
      },
      {
        label: "Water freezing point",
        value: "273.15 K",
        note: "At 1 atm",
      },
      {
        label: "Water boiling point",
        value: "373.15 K",
        note: "At 1 atm",
      },
      {
        label: "Standard room temperature",
        value: "293.15 K",
        note: "20 deg C reference",
      },
    ],
  },
  flow_rate: {
    label: "Flow Rate",
    kind: "linear",
    baseUnit: "m3_s",
    defaultFrom: "gpm",
    defaultTo: "m3_hr",
    units: {
      gpm: {
        label: "US gallons per minute",
        symbol: "GPM",
        toBase: 0.003785411784 / 60,
        description: "Pump and hydraulic flow rate",
      },
      lpm: {
        label: "Liters per minute",
        symbol: "LPM",
        toBase: 0.001 / 60,
        description: "Process and coolant flow rate",
      },
      m3_hr: {
        label: "Cubic meters per hour",
        symbol: "m3/hr",
        toBase: 1 / 3600,
        description: "Plant and system flow rate",
      },
      m3_s: {
        label: "Cubic meters per second",
        symbol: "m3/s",
        toBase: 1,
        description: "SI volumetric flow base unit",
      },
    },
    constants: [
      {
        label: "1 GPM",
        value: "0.0630902 L/s",
        note: "US gallon basis",
      },
      {
        label: "1 m3/s",
        value: "60,000 LPM",
        note: "Large plant-scale flow",
      },
      {
        label: "1 m3/hr",
        value: "0.277778 L/s",
        note: "HVAC and process reference",
      },
    ],
  },
  torque: {
    label: "Torque",
    kind: "linear",
    baseUnit: "n_m",
    defaultFrom: "n_m",
    defaultTo: "ft_lb",
    units: {
      n_m: {
        label: "Newton meter",
        symbol: "N.m",
        toBase: 1,
        description: "SI torque base unit",
      },
      ft_lb: {
        label: "Foot-pound",
        symbol: "ft.lb",
        toBase: 1.3558179483314,
        description: "Imperial torque reference",
      },
      in_lb: {
        label: "Inch-pound",
        symbol: "in.lb",
        toBase: 0.1129848290276167,
        description: "Fastener and component torque",
      },
    },
    constants: [
      {
        label: "1 ft.lb",
        value: "1.355818 N.m",
        note: "Exact conversion reference",
      },
      {
        label: "1 in.lb",
        value: "0.112985 N.m",
        note: "Small fastener torque reference",
      },
    ],
  },
  force: {
    label: "Force",
    kind: "linear",
    baseUnit: "n",
    defaultFrom: "kn",
    defaultTo: "lbf",
    units: {
      n: {
        label: "Newton",
        symbol: "N",
        toBase: 1,
        description: "SI force base unit",
      },
      kn: {
        label: "Kilonewton",
        symbol: "kN",
        toBase: 1_000,
        description: "Structural and mechanical loading",
      },
      lbf: {
        label: "Pound-force",
        symbol: "lbf",
        toBase: 4.4482216152605,
        description: "Imperial force reference",
      },
    },
    constants: [
      {
        label: "Standard gravity",
        value: "9.80665 m/s2",
        note: "Used for weight-force references",
      },
      {
        label: "1 lbf",
        value: "4.448222 N",
        note: "Exact reference conversion",
      },
    ],
  },
  length: {
    label: "Length",
    kind: "linear",
    baseUnit: "m",
    defaultFrom: "mm",
    defaultTo: "in",
    units: {
      mm: {
        label: "Millimeter",
        symbol: "mm",
        toBase: 0.001,
        description: "Precision fabrication dimension",
      },
      cm: {
        label: "Centimeter",
        symbol: "cm",
        toBase: 0.01,
        description: "Metric dimensioning unit",
      },
      m: {
        label: "Meter",
        symbol: "m",
        toBase: 1,
        description: "SI length base unit",
      },
      in: {
        label: "Inch",
        symbol: "in",
        toBase: 0.0254,
        description: "Imperial design dimension",
      },
      ft: {
        label: "Foot",
        symbol: "ft",
        toBase: 0.3048,
        description: "Imperial field and deck dimension",
      },
    },
    constants: [
      {
        label: "1 inch",
        value: "25.4 mm",
        note: "Exact definition",
      },
      {
        label: "1 foot",
        value: "0.3048 m",
        note: "Exact definition",
      },
    ],
  },
  mass: {
    label: "Mass",
    kind: "linear",
    baseUnit: "kg",
    defaultFrom: "kg",
    defaultTo: "lb",
    units: {
      kg: {
        label: "Kilogram",
        symbol: "kg",
        toBase: 1,
        description: "SI mass base unit",
      },
      g: {
        label: "Gram",
        symbol: "g",
        toBase: 0.001,
        description: "Laboratory and material mass",
      },
      lb: {
        label: "Pound mass",
        symbol: "lb",
        toBase: 0.45359237,
        description: "Imperial mass reference",
      },
    },
    constants: [
      {
        label: "1 lb",
        value: "0.45359237 kg",
        note: "Exact conversion reference",
      },
      {
        label: "1 kg",
        value: "2.20462262 lb",
        note: "Common engineering reference",
      },
    ],
  },
  power: {
    label: "Power",
    kind: "linear",
    baseUnit: "w",
    defaultFrom: "kw",
    defaultTo: "hp",
    units: {
      w: {
        label: "Watt",
        symbol: "W",
        toBase: 1,
        description: "SI power base unit",
      },
      kw: {
        label: "Kilowatt",
        symbol: "kW",
        toBase: 1_000,
        description: "Equipment and plant power",
      },
      hp: {
        label: "Mechanical horsepower",
        symbol: "hp",
        toBase: 745.6998715822702,
        description: "Mechanical drive rating",
      },
    },
    constants: [
      {
        label: "1 hp",
        value: "745.699872 W",
        note: "Mechanical horsepower",
      },
      {
        label: "1 kW",
        value: "1.341022 hp",
        note: "Common machinery reference",
      },
    ],
  },
  electrical: {
    label: "Electrical",
    kind: "linear",
    baseUnit: "v",
    defaultFrom: "v",
    defaultTo: "mv",
    disclaimer:
      "Electrical units are grouped by physical dimension. Voltage, current, and frequency cannot be cross-converted without additional system data.",
    units: {
      v: {
        label: "Volt",
        symbol: "V",
        toBase: 1,
        group: "voltage",
        description: "Electrical potential",
      },
      mv: {
        label: "Millivolt",
        symbol: "mV",
        toBase: 0.001,
        group: "voltage",
        description: "Small signal voltage",
      },
      a: {
        label: "Ampere",
        symbol: "A",
        toBase: 1,
        group: "current",
        description: "Electrical current",
      },
      ma: {
        label: "Milliampere",
        symbol: "mA",
        toBase: 0.001,
        group: "current",
        description: "Instrumentation current",
      },
      hz: {
        label: "Hertz",
        symbol: "Hz",
        toBase: 1,
        group: "frequency",
        description: "Signal or power frequency",
      },
    },
    constants: [
      {
        label: "Signal scaling",
        value: "1 V = 1,000 mV",
        note: "Voltage subgroup only",
      },
      {
        label: "Loop scaling",
        value: "1 A = 1,000 mA",
        note: "Current subgroup only",
      },
      {
        label: "Mains frequency",
        value: "50 Hz / 60 Hz",
        note: "Common power system references",
      },
    ],
  },
  vibration: {
    label: "Vibration",
    kind: "linear",
    baseUnit: "m_s2",
    defaultFrom: "g",
    defaultTo: "m_s2",
    units: {
      g: {
        label: "Standard gravity",
        symbol: "g",
        toBase: 9.80665,
        description: "Acceleration in g-units",
      },
      m_s2: {
        label: "Meters per second squared",
        symbol: "m/s2",
        toBase: 1,
        description: "SI acceleration base unit",
      },
    },
    constants: [
      {
        label: "1 g",
        value: "9.80665 m/s2",
        note: "Standard gravity reference",
      },
      {
        label: "Launch vibration screening",
        value: "Multiple g RMS",
        note: "Program-dependent profile",
      },
    ],
  },
  surface_finish: {
    label: "Surface Finish",
    kind: "linear",
    baseUnit: "ra",
    defaultFrom: "ra",
    defaultTo: "rz",
    disclaimer:
      "Surface finish conversion between Ra and Rz is process-dependent. This app uses an approximate engineering factor of Rz = 7 x Ra.",
    units: {
      ra: {
        label: "Arithmetic average roughness",
        symbol: "Ra",
        toBase: 1,
        description: "Baseline roughness measure",
      },
      rz: {
        label: "Average maximum height",
        symbol: "Rz",
        toBase: 1 / 7,
        description: "Approximate conversion to Ra basis",
      },
    },
    constants: [
      {
        label: "Approximate relation",
        value: "Rz ~= 7 x Ra",
        note: "Actual ratio depends on standard and process",
      },
      {
        label: "Fine machined finish",
        value: "Ra 0.8 to 1.6 um",
        note: "Illustrative shop-floor reference",
      },
    ],
  },
  hardness: {
    label: "Hardness",
    kind: "hardness",
    defaultFrom: "hrc",
    defaultTo: "hv",
    disclaimer: "Approximate values. ASTM E140-style lookup/interpolation.",
    units: {
      hrc: {
        label: "Rockwell C",
        symbol: "HRC",
        description: "Rockwell C hardness scale",
      },
      hbw: {
        label: "Brinell",
        symbol: "HBW",
        description: "Brinell hardness scale",
      },
      hv: {
        label: "Vickers",
        symbol: "HV",
        description: "Vickers hardness scale",
      },
    },
    constants: [
      {
        label: "Method",
        value: "Lookup and interpolate",
        note: "No direct formula is used",
      },
      {
        label: "Best practice",
        value: "Verify on the source material spec",
        note: "Material class and heat treatment matter",
      },
    ],
  },
  thermal_conductivity: {
    label: "Thermal Conductivity",
    kind: "linear",
    baseUnit: "w_mk",
    defaultFrom: "w_mk",
    defaultTo: "btu_hr_ft_f",
    units: {
      w_mk: {
        label: "Watt per meter-kelvin",
        symbol: "W/m.K",
        toBase: 1,
        description: "SI thermal conductivity base unit",
      },
      btu_hr_ft_f: {
        label: "BTU per hour-foot-degree F",
        symbol: "BTU/hr.ft.F",
        toBase: 1.730734666,
        description: "Imperial thermal conductivity unit",
      },
      kcal_m_hr_c: {
        label: "Kilocalorie per meter-hour-degree C",
        symbol: "kcal/m.hr.C",
        toBase: 1.163,
        description: "Legacy process heat-transfer unit",
      },
      cal_cm_s_c: {
        label: "Calorie per centimeter-second-degree C",
        symbol: "cal/cm.s.C",
        toBase: 418.68,
        description: "High-conductivity laboratory unit",
      },
    },
    constants: [
      {
        label: "Copper",
        value: "~401 W/m.K",
        note: "Typical room-temperature conductivity",
      },
      {
        label: "Stainless steel",
        value: "~16 W/m.K",
        note: "Typical room-temperature conductivity",
      },
      {
        label: "1 BTU/hr.ft.F",
        value: "1.730735 W/m.K",
        note: "Reference conversion",
      },
    ],
  },
};

const CATEGORY_KEYS = Object.keys(CATEGORY_CONFIGS) as CategoryKey[];

function readStoredArray<T>(storageKey: string, storageType: "local" | "session") {
  if (typeof window === "undefined") {
    return [] as T[];
  }

  const storage =
    storageType === "local" ? window.localStorage : window.sessionStorage;

  try {
    const rawValue = storage.getItem(storageKey);
    return rawValue ? (JSON.parse(rawValue) as T[]) : [];
  } catch {
    storage.removeItem(storageKey);
    return [];
  }
}

function readInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function readInitialState(): AppState {
  const defaults = CATEGORY_CONFIGS.pressure;

  if (typeof window === "undefined") {
    return {
      category: "pressure",
      inputValue: "100",
      fromUnit: defaults.defaultFrom,
      toUnit: defaults.defaultTo,
      precision: 4,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const categoryParam = params.get("category");
  const category = CATEGORY_KEYS.includes(categoryParam as CategoryKey)
    ? (categoryParam as CategoryKey)
    : "pressure";
  const config = CATEGORY_CONFIGS[category];
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const precisionParam = Number(params.get("precision"));

  return {
    category,
    inputValue: params.get("value") ?? "100",
    fromUnit:
      fromParam && config.units[fromParam] ? fromParam : config.defaultFrom,
    toUnit: toParam && config.units[toParam] ? toParam : config.defaultTo,
    precision: PRECISION_OPTIONS.includes(precisionParam) ? precisionParam : 4,
  };
}

function parseInputValue(value: string) {
  if (value.trim() === "") {
    return Number.NaN;
  }

  return Number(value);
}

function toKelvin(value: number, unit: string) {
  switch (unit) {
    case "c":
      return value + 273.15;
    case "f":
      return ((value - 32) * 5) / 9 + 273.15;
    case "k":
      return value;
    case "r":
      return value * (5 / 9);
    default:
      return value;
  }
}

function fromKelvin(value: number, unit: string) {
  switch (unit) {
    case "c":
      return value - 273.15;
    case "f":
      return ((value - 273.15) * 9) / 5 + 32;
    case "k":
      return value;
    case "r":
      return value * (9 / 5);
    default:
      return value;
  }
}

function interpolateLinear(
  x: number,
  x1: number,
  x2: number,
  y1: number,
  y2: number,
) {
  if (x2 === x1) {
    return y1;
  }

  return y1 + ((x - x1) * (y2 - y1)) / (x2 - x1);
}

function lookupHardnessValue(
  sourceKey: "hrc" | "hbw" | "hv",
  targetKey: "hrc" | "hbw" | "hv",
  value: number,
): ConversionResult {
  if (sourceKey === targetKey) {
    return { value, approximate: true };
  }

  const rows = HARDNESS_TABLE;
  const minValue = rows[0][sourceKey];
  const maxValue = rows[rows.length - 1][sourceKey];

  if (value < minValue || value > maxValue) {
    return {
      value: null,
      approximate: true,
      error: `Outside supported ${sourceKey.toUpperCase()} table range (${minValue} to ${maxValue}).`,
    };
  }

  for (let index = 0; index < rows.length - 1; index += 1) {
    const current = rows[index];
    const next = rows[index + 1];
    const lower = current[sourceKey];
    const upper = next[sourceKey];

    if (value >= lower && value <= upper) {
      return {
        value: interpolateLinear(
          value,
          lower,
          upper,
          current[targetKey],
          next[targetKey],
        ),
        approximate: true,
      };
    }
  }

  return { value: rows[rows.length - 1][targetKey], approximate: true };
}

function convertValue(
  category: CategoryKey,
  value: number,
  fromUnit: string,
  toUnit: string,
): ConversionResult {
  if (!Number.isFinite(value)) {
    return { value: null, error: "Enter a valid numeric value." };
  }

  const config = CATEGORY_CONFIGS[category];

  if (config.kind === "temperature") {
    return {
      value: fromKelvin(toKelvin(value, fromUnit), toUnit),
    } satisfies ConversionResult;
  }

  if (config.kind === "hardness") {
    return lookupHardnessValue(
      fromUnit as "hrc" | "hbw" | "hv",
      toUnit as "hrc" | "hbw" | "hv",
      value,
    );
  }

  const fromDefinition = config.units[fromUnit];
  const toDefinition = config.units[toUnit];

  if (!fromDefinition || !toDefinition) {
    return { value: null, error: "Unsupported unit selection." };
  }

  if (fromDefinition.group && toDefinition.group && fromDefinition.group !== toDefinition.group) {
    return {
      value: null,
      error: "Selected units are in different electrical dimensions.",
    };
  }

  if (!fromDefinition.toBase || !toDefinition.toBase) {
    return { value: null, error: "Missing conversion factor." };
  }

  return {
    value: (value * fromDefinition.toBase) / toDefinition.toBase,
    approximate: category === "surface_finish",
  };
}

function formatValue(value: number | null, precision: number) {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  }).format(value);
}

function formatRecentLabel(entry: RecentEntry) {
  return `${entry.input} ${entry.fromUnit} = ${entry.output} ${entry.toUnit}`;
}

function matchesSearch(unit: UnitDefinition, query: string) {
  if (query.trim() === "") {
    return true;
  }

  const normalizedQuery = query.trim().toLowerCase();
  return `${unit.label} ${unit.symbol} ${unit.description}`
    .toLowerCase()
    .includes(normalizedQuery);
}

function UnitPicker({
  fieldId,
  label,
  searchValue,
  onSearchChange,
  selectedUnit,
  onChange,
  units,
}: {
  fieldId: string;
  label: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  selectedUnit: string;
  onChange: (value: string) => void;
  units: Record<string, UnitDefinition>;
}) {
  const filteredUnits = Object.entries(units).filter(([, unit]) =>
    matchesSearch(unit, searchValue),
  );

  const options = filteredUnits.length > 0 ? filteredUnits : Object.entries(units);

  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
        {label}
      </span>
      <input
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
        className="w-full rounded-[1rem] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-cyan-400/20"
        placeholder="Search unit"
        aria-label={`${label} search`}
      />
      <select
        id={fieldId}
        value={selectedUnit}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 text-base font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-cyan-400/20"
      >
        {options.map(([key, unit]) => (
          <option key={key} value={key}>
            {unit.symbol} | {unit.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function Home() {
  const [initialState] = useState(readInitialState);
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme);
  const [category, setCategory] = useState<CategoryKey>(initialState.category);
  const [inputValue, setInputValue] = useState(initialState.inputValue);
  const [fromUnit, setFromUnit] = useState(initialState.fromUnit);
  const [toUnit, setToUnit] = useState(initialState.toUnit);
  const [precision, setPrecision] = useState(initialState.precision);
  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");
  const [recents, setRecents] = useState<RecentEntry[]>(() =>
    readStoredArray<RecentEntry>(SESSION_RECENTS_KEY, "session"),
  );
  const [favorites, setFavorites] = useState<FavoriteEntry[]>(() =>
    readStoredArray<FavoriteEntry>(LOCAL_FAVORITES_KEY, "local"),
  );
  const [constantsOpen, setConstantsOpen] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );

  const config = CATEGORY_CONFIGS[category];
  const parsedValue = parseInputValue(inputValue);
  const conversion = useMemo(
    () => convertValue(category, parsedValue, fromUnit, toUnit),
    [category, parsedValue, fromUnit, toUnit],
  );
  const formattedOutput = useMemo(
    () => formatValue(conversion.value, precision),
    [conversion.value, precision],
  );
  const activeFavoriteId = `${category}:${fromUnit}:${toUnit}`;
  const isFavorite = favorites.some((entry) => entry.id === activeFavoriteId);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    sessionStorage.setItem(SESSION_RECENTS_KEY, JSON.stringify(recents));
  }, [recents]);

  useEffect(() => {
    localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("category", category);
    params.set("value", inputValue);
    params.set("from", fromUnit);
    params.set("to", toUnit);
    params.set("precision", String(precision));
    window.history.replaceState({}, "", `?${params.toString()}`);
  }, [category, fromUnit, inputValue, precision, toUnit]);

  useEffect(() => {
    if (!Number.isFinite(parsedValue) || conversion.value === null) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const nextEntry: RecentEntry = {
        id: `${category}:${fromUnit}:${toUnit}:${inputValue}:${precision}`,
        category,
        input: formatValue(parsedValue, precision),
        output: formatValue(conversion.value, precision),
        fromUnit: config.units[fromUnit].symbol,
        toUnit: config.units[toUnit].symbol,
        precision,
        note: conversion.approximate ? "Approximate" : undefined,
      };

      setRecents((current) => {
        const deduped = current.filter((entry) => entry.id !== nextEntry.id);
        return [nextEntry, ...deduped].slice(0, 10);
      });
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [
    category,
    config.units,
    conversion.approximate,
    conversion.value,
    fromUnit,
    inputValue,
    parsedValue,
    precision,
    toUnit,
  ]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      return undefined;
    });
  }, []);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
    };
  }, []);

  function handleCategoryChange(nextCategory: CategoryKey) {
    const nextConfig = CATEGORY_CONFIGS[nextCategory];
    setCategory(nextCategory);
    setFromUnit(nextConfig.defaultFrom);
    setToUnit(nextConfig.defaultTo);
    setFromSearch("");
    setToSearch("");
  }

  function swapUnits() {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
  }

  function toggleFavorite() {
    if (isFavorite) {
      setFavorites((current) =>
        current.filter((entry) => entry.id !== activeFavoriteId),
      );
      return;
    }

    const nextFavorite: FavoriteEntry = {
      id: activeFavoriteId,
      category,
      fromUnit,
      toUnit,
    };

    setFavorites((current) => [nextFavorite, ...current].slice(0, 12));
  }

  function applyFavorite(entry: FavoriteEntry) {
    setCategory(entry.category);
    setFromUnit(entry.fromUnit);
    setToUnit(entry.toUnit);
    setFromSearch("");
    setToSearch("");
  }

  async function handleInstallClick() {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  const themeToggleLabel = theme === "dark" ? "Light mode" : "Dark mode";

  return (
    <main className="min-h-screen px-4 py-4 sm:px-6 lg:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-7xl flex-col gap-4">
        <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.18)] backdrop-blur md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--accent-soft)]">
                Specialized Engineering Converter
              </p>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl">
                  CW unit converter
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                  Offline-ready unit conversion for aerospace, naval, and nuclear
                  engineering workflows, with session recents, saved favorites,
                  and URL-shareable conversion state.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setTheme((current) => (current === "dark" ? "light" : "dark"))
                }
                className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)]"
              >
                {themeToggleLabel}
              </button>
              {installPrompt ? (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-slate-950 transition hover:opacity-90"
                >
                  Add to home screen
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-4 md:p-5">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORY_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleCategoryChange(key)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition ${
                  category === key
                    ? "border-[var(--accent)] bg-[var(--accent)] text-slate-950"
                    : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground)] hover:border-[var(--accent)]"
                }`}
              >
                {CATEGORY_CONFIGS[key].label}
              </button>
            ))}
          </div>
        </section>

        <section className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.85fr)]">
          <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.12)] md:p-6">
            <div className="flex flex-col gap-6">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
                    Input value
                  </span>
                  <input
                    inputMode="text"
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    className="w-full rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface-2)] px-5 py-4 text-2xl font-semibold text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-cyan-400/20"
                    placeholder="Supports 1.5e6"
                    aria-label="Input value"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
                    Precision
                  </span>
                  <select
                    value={precision}
                    onChange={(event) => setPrecision(Number(event.target.value))}
                    className="w-full rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 text-base font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-cyan-400/20"
                  >
                    {PRECISION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option} decimals
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
                <UnitPicker
                  fieldId="from-unit"
                  label="From"
                  searchValue={fromSearch}
                  onSearchChange={setFromSearch}
                  selectedUnit={fromUnit}
                  onChange={setFromUnit}
                  units={config.units}
                />

                <button
                  type="button"
                  onClick={swapUnits}
                  className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-sm font-semibold text-[var(--accent)] transition hover:border-[var(--accent)] hover:bg-cyan-400/10"
                  aria-label="Swap units"
                  title="Swap units"
                >
                  SWAP
                </button>

                <UnitPicker
                  fieldId="to-unit"
                  label="To"
                  searchValue={toSearch}
                  onSearchChange={setToSearch}
                  selectedUnit={toUnit}
                  onChange={setToUnit}
                  units={config.units}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={toggleFavorite}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    isFavorite
                      ? "border-amber-300/60 bg-amber-300/15 text-amber-200"
                      : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground)] hover:border-amber-300/40 hover:bg-amber-300/10"
                  }`}
                >
                  {isFavorite ? "Favorited pair" : "Save as favorite"}
                </button>

                <div className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm text-[var(--muted)]">
                  Shareable URL state enabled
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface-2)] p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent-soft)]">
                      Live conversion
                    </p>
                    <p className="mt-3 text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl">
                      {formattedOutput}
                    </p>
                  </div>
                  <div className="text-sm text-[var(--muted)]">
                    <p>
                      {config.units[fromUnit]?.symbol} to {config.units[toUnit]?.symbol}
                    </p>
                    <p className="mt-1 max-w-sm">
                      {conversion.error
                        ? conversion.error
                        : config.units[toUnit]?.description}
                    </p>
                  </div>
                </div>
              </div>

              {config.disclaimer || conversion.approximate ? (
                <div className="rounded-[1.4rem] border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
                  {config.disclaimer ??
                    "Approximate conversion. Validate against project standards before release use."}
                </div>
              ) : null}

              <details
                open={constantsOpen}
                onToggle={(event) =>
                  setConstantsOpen((event.target as HTMLDetailsElement).open)
                }
                className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-2)]"
              >
                <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold uppercase tracking-[0.24em] text-[var(--foreground)]">
                  Engineering constants
                </summary>
                <div className="grid gap-3 border-t border-[var(--border)] px-5 py-4 sm:grid-cols-2">
                  {config.constants.map((constant) => (
                    <article
                      key={constant.label}
                      className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-4"
                    >
                      <h2 className="text-sm font-semibold text-[var(--foreground)]">
                        {constant.label}
                      </h2>
                      <p className="mt-2 text-lg font-medium text-[var(--accent-soft)]">
                        {constant.value}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                        {constant.note}
                      </p>
                    </article>
                  ))}
                </div>
              </details>
            </div>
          </div>
          <aside className="grid gap-4">
            <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-4 backdrop-blur md:p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--foreground)]">
                  Favorites
                </h2>
                <span className="text-xs text-[var(--muted)]">Local storage</span>
              </div>

              <div className="mt-4 grid gap-3">
                {favorites.length === 0 ? (
                  <p className="rounded-[1.25rem] border border-dashed border-[var(--border)] px-4 py-5 text-sm leading-6 text-[var(--muted)]">
                    Save high-frequency unit pairs for torque checks, flow
                    balancing, hardness cross-reference, and field calculations.
                  </p>
                ) : (
                  favorites.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => applyFavorite(entry)}
                      className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-left transition hover:border-[var(--accent)] hover:bg-cyan-400/10"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                        {CATEGORY_CONFIGS[entry.category].label}
                      </p>
                      <p className="mt-2 text-base font-medium text-[var(--foreground)]">
                        {CATEGORY_CONFIGS[entry.category].units[entry.fromUnit].symbol} to{" "}
                        {CATEGORY_CONFIGS[entry.category].units[entry.toUnit].symbol}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-4 backdrop-blur md:p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--foreground)]">
                  Recent conversions
                </h2>
                <span className="text-xs text-[var(--muted)]">Last 10</span>
              </div>

              <div className="mt-4 grid gap-3">
                {recents.length === 0 ? (
                  <p className="rounded-[1.25rem] border border-dashed border-[var(--border)] px-4 py-5 text-sm leading-6 text-[var(--muted)]">
                    Session history appears here automatically as values change.
                  </p>
                ) : (
                  recents.map((entry) => (
                    <article
                      key={entry.id}
                      className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                        {CATEGORY_CONFIGS[entry.category].label}
                      </p>
                      <p className="mt-2 text-base font-medium text-[var(--foreground)]">
                        {formatRecentLabel(entry)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Precision: {entry.precision}
                        {entry.note ? ` | ${entry.note}` : ""}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-4 backdrop-blur md:p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--foreground)]">
                Keyboard and Offline
              </h2>
              <div className="mt-4 grid gap-3 text-sm leading-6 text-[var(--muted)]">
                <p className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                  Tab through search, selectors, precision, swap, favorite, and
                  category tabs without leaving the keyboard.
                </p>
                <p className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                  The app installs a service worker and manifest so repeated use
                  remains available offline.
                </p>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
