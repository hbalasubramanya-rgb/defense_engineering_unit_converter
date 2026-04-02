"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

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

type ConversionResult = {
  value: number | null;
  approximate?: boolean;
  error?: string;
};

type ValidationState = "idle" | "ready" | "warning" | "error";

type ValidationSummary = {
  state: ValidationState;
  title: string;
  detail: string;
};

type AppState = {
  category: CategoryKey;
  inputValue: string;
  fromUnit: string;
  toUnit: string;
  precision: number;
};

type RecentEntry = {
  id: string;
  createdAt: string;
  category: CategoryKey;
  input: string;
  output: string;
  fromUnit: string;
  toUnit: string;
  precision: number;
  note?: string;
};

type TemplateEntry = {
  id: string;
  label: string;
  createdAt: string;
  category: CategoryKey;
  inputValue: string;
  fromUnit: string;
  toUnit: string;
  precision: number;
};

type PresetDefinition = {
  id: string;
  label: string;
  note: string;
  category: CategoryKey;
  inputValue: string;
  fromUnit: string;
  toUnit: string;
  precision?: number;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type GraphPoint = {
  input: number;
  output: number;
};

const PRECISION_OPTIONS = [2, 4, 6, 8];
const SESSION_RECENTS_KEY = "cw-unit-converter-recents";
const LOCAL_TEMPLATES_KEY = "cw-unit-converter-templates";
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

const PRESET_CONFIGS: PresetDefinition[] = [
  {
    id: "hydraulic-setpoint",
    label: "Hydraulic setpoint",
    note: "Bench test conversion for regulator setup",
    category: "pressure",
    inputValue: "3500",
    fromUnit: "psi",
    toUnit: "mpa",
    precision: 4,
  },
  {
    id: "pump-balance",
    label: "Pump balance",
    note: "Flow check for transfer pump sizing",
    category: "flow_rate",
    inputValue: "180",
    fromUnit: "gpm",
    toUnit: "m3_hr",
    precision: 4,
  },
  {
    id: "fastener-check",
    label: "Fastener torque",
    note: "Field conversion for maintenance cards",
    category: "torque",
    inputValue: "125",
    fromUnit: "n_m",
    toUnit: "ft_lb",
    precision: 4,
  },
  {
    id: "thermal-window",
    label: "Thermal window",
    note: "Component exposure review",
    category: "temperature",
    inputValue: "650",
    fromUnit: "f",
    toUnit: "c",
    precision: 2,
  },
  {
    id: "surface-review",
    label: "Surface finish review",
    note: "Approximate drawing callout conversion",
    category: "surface_finish",
    inputValue: "1.6",
    fromUnit: "ra",
    toUnit: "rz",
    precision: 2,
  },
  {
    id: "material-hardness",
    label: "Material hardness",
    note: "Lookup-based cross-reference",
    category: "hardness",
    inputValue: "42",
    fromUnit: "hrc",
    toUnit: "hv",
    precision: 0,
  },
];

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

  const minValue = HARDNESS_TABLE[0][sourceKey];
  const maxValue = HARDNESS_TABLE[HARDNESS_TABLE.length - 1][sourceKey];

  if (value < minValue || value > maxValue) {
    return {
      value: null,
      approximate: true,
      error: `Outside supported ${sourceKey.toUpperCase()} table range (${minValue} to ${maxValue}).`,
    };
  }

  for (let index = 0; index < HARDNESS_TABLE.length - 1; index += 1) {
    const current = HARDNESS_TABLE[index];
    const next = HARDNESS_TABLE[index + 1];
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

  return {
    value: HARDNESS_TABLE[HARDNESS_TABLE.length - 1][targetKey],
    approximate: true,
  };
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
    const kelvin = toKelvin(value, fromUnit);
    if (kelvin < 0) {
      return {
        value: null,
        error: "Temperature cannot be below absolute zero.",
      };
    }

    return {
      value: fromKelvin(kelvin, toUnit),
    };
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

  if (
    fromDefinition.group &&
    toDefinition.group &&
    fromDefinition.group !== toDefinition.group
  ) {
    return {
      value: null,
      error: "Selected units are in different electrical dimensions.",
    };
  }

  if (fromDefinition.toBase === undefined || toDefinition.toBase === undefined) {
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

function formatDateLabel(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
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

function getStatusSummary(
  category: CategoryKey,
  inputValue: string,
  conversion: ConversionResult,
): ValidationSummary {
  if (inputValue.trim() === "") {
    return {
      state: "idle",
      title: "Awaiting input",
      detail: "Enter a numeric value to start live conversion.",
    };
  }

  if (conversion.error) {
    return {
      state: "error",
      title: "Validation failed",
      detail: conversion.error,
    };
  }

  if (conversion.approximate || CATEGORY_CONFIGS[category].disclaimer) {
    return {
      state: "warning",
      title: "Approximate result",
      detail:
        CATEGORY_CONFIGS[category].disclaimer ??
        "This conversion is intentionally approximate.",
    };
  }

  return {
    state: "ready",
    title: "Live result active",
    detail: "Results are updating as you type and edit units.",
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildGraphPoints(
  category: CategoryKey,
  fromUnit: string,
  toUnit: string,
  inputValue: number,
): GraphPoint[] {
  if (!Number.isFinite(inputValue)) {
    return [];
  }

  const config = CATEGORY_CONFIGS[category];
  let min = 0;
  let max = 0;

  if (config.kind === "temperature") {
    min = Math.min(inputValue - 100, -40);
    max = Math.max(inputValue + 100, 200);
  } else if (config.kind === "hardness") {
    min = HARDNESS_TABLE[0][fromUnit as "hrc" | "hbw" | "hv"];
    max = HARDNESS_TABLE[HARDNESS_TABLE.length - 1][fromUnit as "hrc" | "hbw" | "hv"];
  } else {
    const magnitude = Math.max(Math.abs(inputValue), 1);
    min = inputValue >= 0 ? 0 : inputValue * 1.25;
    max = inputValue >= 0 ? magnitude * 1.25 : magnitude;
  }

  if (min === max) {
    max += 1;
  }

  const points: GraphPoint[] = [];
  const steps = 6;

  for (let index = 0; index <= steps; index += 1) {
    const currentInput = min + ((max - min) * index) / steps;
    const result = convertValue(category, currentInput, fromUnit, toUnit);
    if (result.value !== null && Number.isFinite(result.value)) {
      points.push({ input: currentInput, output: result.value });
    }
  }

  return points;
}

function buildTemplateLabel(
  category: CategoryKey,
  fromUnit: string,
  toUnit: string,
  inputValue: string,
) {
  return `${CATEGORY_CONFIGS[category].label} | ${inputValue} ${CATEGORY_CONFIGS[category].units[fromUnit].symbol} -> ${CATEGORY_CONFIGS[category].units[toUnit].symbol}`;
}

function statusClassName(state: ValidationState) {
  switch (state) {
    case "ready":
      return "border-emerald-400/40 bg-emerald-400/10 text-emerald-100";
    case "warning":
      return "border-amber-300/40 bg-amber-300/10 text-amber-100";
    case "error":
      return "border-rose-400/40 bg-rose-400/10 text-rose-100";
    default:
      return "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]";
  }
}

function UnitPicker({
  fieldId,
  label,
  tooltip,
  searchValue,
  onSearchChange,
  selectedUnit,
  onChange,
  units,
}: {
  fieldId: string;
  label: string;
  tooltip: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  selectedUnit: string;
  onChange: (value: string) => void;
  units: Record<string, UnitDefinition>;
}) {
  const deferredQuery = useDeferredValue(searchValue);
  const filteredUnits = Object.entries(units).filter(([, unit]) =>
    matchesSearch(unit, deferredQuery),
  );
  const options = filteredUnits.length > 0 ? filteredUnits : Object.entries(units);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor={fieldId}
          className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[var(--muted)]"
        >
          {label}
        </label>
        <span
          className="cursor-help rounded-full border border-[var(--border)] px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]"
          title={tooltip}
        >
          hint
        </span>
      </div>
      <input
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
        className="w-full rounded-[1rem] border border-[var(--border)] bg-[var(--surface-3)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-cyan-400/20"
        placeholder="Search unit"
        aria-label={`${label} search`}
      />
      <select
        id={fieldId}
        value={selectedUnit}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[1.3rem] border border-[var(--border)] bg-[var(--surface-3)] px-4 py-4 text-base font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-cyan-400/20"
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

function ConversionGraph({
  category,
  fromUnit,
  toUnit,
  inputValue,
  precision,
}: {
  category: CategoryKey;
  fromUnit: string;
  toUnit: string;
  inputValue: number;
  precision: number;
}) {
  const points = useMemo(
    () => buildGraphPoints(category, fromUnit, toUnit, inputValue),
    [category, fromUnit, inputValue, toUnit],
  );

  if (points.length < 2) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-[var(--border)] bg-[var(--surface-3)] px-4 py-5 text-sm leading-6 text-[var(--muted)]">
        Graph feedback appears when the current input is valid.
      </div>
    );
  }

  const outputs = points.map((point) => point.output);
  const minOutput = Math.min(...outputs);
  const maxOutput = Math.max(...outputs);
  const chartWidth = 320;
  const chartHeight = 144;
  const normalizedPath = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * chartWidth;
      const y =
        maxOutput === minOutput
          ? chartHeight / 2
          : chartHeight -
            ((point.output - minOutput) / (maxOutput - minOutput)) * chartHeight;

      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const currentResult = convertValue(category, inputValue, fromUnit, toUnit);
  const ratio =
    currentResult.value !== null && Number.isFinite(currentResult.value)
      ? clamp(
          maxOutput === minOutput
            ? 0.5
            : (currentResult.value - minOutput) / (maxOutput - minOutput),
          0,
          1,
        )
      : 0.5;

  return (
    <div className="rounded-[1.6rem] border border-[var(--border)] bg-[var(--surface-3)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[var(--muted)]">
            Conversion profile
          </p>
          <p className="mt-1 text-sm text-[var(--foreground)]">
            {CATEGORY_CONFIGS[category].units[fromUnit].symbol} to{" "}
            {CATEGORY_CONFIGS[category].units[toUnit].symbol}
          </p>
        </div>
        <div className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
          current:{" "}
          {currentResult.value === null
            ? "--"
            : `${formatValue(currentResult.value, precision)} ${CATEGORY_CONFIGS[category].units[toUnit].symbol}`}
        </div>
      </div>

      <div className="mt-4 rounded-[1.2rem] border border-[var(--border)] bg-[var(--surface)] p-3">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-36 w-full"
          role="img"
          aria-label="Conversion trend graph"
        >
          <defs>
            <linearGradient id="conversion-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(104, 203, 255, 0.4)" />
              <stop offset="100%" stopColor="rgba(255, 214, 102, 0.95)" />
            </linearGradient>
          </defs>
          <path
            d={normalizedPath}
            fill="none"
            stroke="url(#conversion-gradient)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <line
            x1={ratio * chartWidth}
            y1="0"
            x2={ratio * chartWidth}
            y2={chartHeight}
            stroke="rgba(255,255,255,0.3)"
            strokeDasharray="4 6"
          />
        </svg>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[1.1rem] border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">
            output range
          </p>
          <p className="mt-2 text-sm font-medium text-[var(--foreground)]">
            {formatValue(minOutput, precision)} to {formatValue(maxOutput, precision)}
          </p>
        </div>
        <div className="rounded-[1.1rem] border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">
            lower sample
          </p>
          <p className="mt-2 text-sm font-medium text-[var(--foreground)]">
            {formatValue(points[0].input, precision)}{" "}
            {CATEGORY_CONFIGS[category].units[fromUnit].symbol}
          </p>
        </div>
        <div className="rounded-[1.1rem] border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">
            upper sample
          </p>
          <p className="mt-2 text-sm font-medium text-[var(--foreground)]">
            {formatValue(points[points.length - 1].input, precision)}{" "}
            {CATEGORY_CONFIGS[category].units[fromUnit].symbol}
          </p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-[1.3rem] border border-[var(--border)] bg-[var(--surface-3)] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-3 text-xl font-semibold text-[var(--foreground)]">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{detail}</p>
    </article>
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
  const [templates, setTemplates] = useState<TemplateEntry[]>(() =>
    readStoredArray<TemplateEntry>(LOCAL_TEMPLATES_KEY, "local"),
  );
  const [constantsOpen, setConstantsOpen] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">(
    "idle",
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
  const statusSummary = useMemo(
    () => getStatusSummary(category, inputValue, conversion),
    [category, conversion, inputValue],
  );
  const categoryPresets = useMemo(
    () => PRESET_CONFIGS.filter((preset) => preset.category === category),
    [category],
  );
  const currentTemplateId = `${category}:${inputValue}:${fromUnit}:${toUnit}:${precision}`;
  const hasTemplate = templates.some((entry) => entry.id === currentTemplateId);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.sessionStorage.setItem(SESSION_RECENTS_KEY, JSON.stringify(recents));
  }, [recents]);

  useEffect(() => {
    window.localStorage.setItem(LOCAL_TEMPLATES_KEY, JSON.stringify(templates));
  }, [templates]);

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
        createdAt: new Date().toISOString(),
        category,
        input: formatValue(parsedValue, precision),
        output: formatValue(conversion.value, precision),
        fromUnit: config.units[fromUnit].symbol,
        toUnit: config.units[toUnit].symbol,
        precision,
        note: conversion.approximate ? "approximate" : "exact",
      };

      setRecents((current) => {
        const deduped = current.filter((entry) => entry.id !== nextEntry.id);
        return [nextEntry, ...deduped].slice(0, 12);
      });
    }, 350);

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

    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
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

  function applySnapshot(snapshot: AppState) {
    startTransition(() => {
      setCategory(snapshot.category);
      setInputValue(snapshot.inputValue);
      setFromUnit(snapshot.fromUnit);
      setToUnit(snapshot.toUnit);
      setPrecision(snapshot.precision);
      setFromSearch("");
      setToSearch("");
    });
  }

  function handleCategoryChange(nextCategory: CategoryKey) {
    const nextConfig = CATEGORY_CONFIGS[nextCategory];

    applySnapshot({
      category: nextCategory,
      inputValue,
      fromUnit: nextConfig.defaultFrom,
      toUnit: nextConfig.defaultTo,
      precision,
    });
  }

  function applyPreset(preset: PresetDefinition) {
    applySnapshot({
      category: preset.category,
      inputValue: preset.inputValue,
      fromUnit: preset.fromUnit,
      toUnit: preset.toUnit,
      precision: preset.precision ?? precision,
    });
  }

  function applyTemplate(template: TemplateEntry) {
    applySnapshot({
      category: template.category,
      inputValue: template.inputValue,
      fromUnit: template.fromUnit,
      toUnit: template.toUnit,
      precision: template.precision,
    });
  }

  function swapUnits() {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
  }

  function saveTemplate() {
    const nextTemplate: TemplateEntry = {
      id: currentTemplateId,
      label: buildTemplateLabel(category, fromUnit, toUnit, inputValue || "0"),
      createdAt: new Date().toISOString(),
      category,
      inputValue,
      fromUnit,
      toUnit,
      precision,
    };

    setTemplates((current) => {
      const filtered = current.filter((entry) => entry.id !== nextTemplate.id);
      return [nextTemplate, ...filtered].slice(0, 10);
    });
  }

  function removeTemplate(templateId: string) {
    setTemplates((current) => current.filter((entry) => entry.id !== templateId));
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareState("copied");
      window.setTimeout(() => setShareState("idle"), 1500);
    } catch {
      setShareState("failed");
      window.setTimeout(() => setShareState("idle"), 1800);
    }
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
  const exactnessLabel = conversion.approximate ? "Approximate" : "Direct";
  const recentsTableLabel = "conversion_history";
  const templatesTableLabel = "saved_templates";

  return (
    <main className="min-h-screen px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1500px] flex-col gap-5">
        <section className="rounded-[2.3rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_30px_120px_rgba(5,10,20,0.28)] backdrop-blur md:p-7">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--accent-soft)]">
                  Interactive engineering workspace
                </span>
                <span className="rounded-full border border-[var(--border)] px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">
                  URL state + local templates
                </span>
              </div>
              <div>
                <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl xl:text-6xl">
                  Real-time unit conversion for field, bench, and design review.
                </h1>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--muted)] sm:text-base">
                  The app now behaves like a live calculation surface instead of a
                  single-action form: validation is immediate, results update while
                  typing, presets snap the interface into common workflows, and the
                  lower panels keep a structured history without adding backend
                  storage complexity.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className={`rounded-[1.6rem] border p-4 ${statusClassName(statusSummary.state)}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em]">
                  Status
                </p>
                <p className="mt-3 text-xl font-semibold">{statusSummary.title}</p>
                <p className="mt-2 text-sm leading-6">{statusSummary.detail}</p>
              </div>

              <div className="rounded-[1.6rem] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
                  Session controls
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setTheme((current) => (current === "dark" ? "light" : "dark"))
                    }
                    className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)]"
                  >
                    {themeToggleLabel}
                  </button>
                  <button
                    type="button"
                    onClick={copyShareLink}
                    className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)]"
                    title="Copy current URL with the active configuration"
                  >
                    {shareState === "copied"
                      ? "Link copied"
                      : shareState === "failed"
                        ? "Copy failed"
                        : "Copy share link"}
                  </button>
                  {installPrompt ? (
                    <button
                      type="button"
                      onClick={handleInstallClick}
                      className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-slate-950 transition hover:opacity-90"
                    >
                      Install app
                    </button>
                  ) : null}
                </div>
              </div>
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
                    : "border-[var(--border)] bg-[var(--surface-3)] text-[var(--foreground)] hover:border-[var(--accent)]"
                }`}
              >
                {CATEGORY_CONFIGS[key].label}
              </button>
            ))}
          </div>
        </section>

        <section className="grid flex-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.95fr)]">
          <div className="grid gap-5">
            <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.12)] md:p-6">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
                        Input value
                        <span
                          className="cursor-help rounded-full border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--muted)]"
                          title="The result updates while you type. Scientific notation such as 1.5e6 is supported."
                        >
                          ?
                        </span>
                      </span>
                      <input
                        inputMode="text"
                        value={inputValue}
                        onChange={(event) => setInputValue(event.target.value)}
                        className={`w-full rounded-[1.5rem] border px-5 py-4 text-3xl font-semibold text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:ring-2 focus:ring-cyan-400/20 ${
                          statusSummary.state === "error"
                            ? "border-rose-400/50 bg-rose-400/10 focus:border-rose-400"
                            : "border-[var(--border)] bg-[var(--surface-3)] focus:border-[var(--accent)]"
                        }`}
                        placeholder="Supports 1.5e6"
                        aria-label="Input value"
                      />
                      <p className="text-sm leading-6 text-[var(--muted)]">
                        {statusSummary.detail}
                      </p>
                    </label>

                    <label className="space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
                        Precision
                      </span>
                      <select
                        value={precision}
                        onChange={(event) => setPrecision(Number(event.target.value))}
                        className="w-full rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-3)] px-4 py-4 text-base font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-cyan-400/20"
                      >
                        {PRECISION_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option} decimals
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-end">
                    <UnitPicker
                      fieldId="from-unit"
                      label="From unit"
                      tooltip="Filter source units by label, symbol, or description."
                      searchValue={fromSearch}
                      onSearchChange={setFromSearch}
                      selectedUnit={fromUnit}
                      onChange={setFromUnit}
                      units={config.units}
                    />

                    <button
                      type="button"
                      onClick={swapUnits}
                      className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-3)] text-sm font-semibold text-[var(--accent)] transition hover:border-[var(--accent)] hover:bg-cyan-400/10"
                      aria-label="Swap units"
                      title="Swap source and target units"
                    >
                      swap
                    </button>

                    <UnitPicker
                      fieldId="to-unit"
                      label="To unit"
                      tooltip="Choose the target unit. The output panel updates immediately."
                      searchValue={toSearch}
                      onSearchChange={setToSearch}
                      selectedUnit={toUnit}
                      onChange={setToUnit}
                      units={config.units}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <MetricCard
                      label="Source"
                      value={config.units[fromUnit].symbol}
                      detail={config.units[fromUnit].description}
                    />
                    <MetricCard
                      label="Target"
                      value={config.units[toUnit].symbol}
                      detail={config.units[toUnit].description}
                    />
                    <MetricCard
                      label="Mode"
                      value={exactnessLabel}
                      detail={
                        conversion.approximate
                          ? "Use the result as a fast engineering estimate."
                          : "Conversion is based on direct scale mapping."
                      }
                    />
                  </div>
                </div>

                <div className="space-y-4 rounded-[1.8rem] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--accent-soft)]">
                      Dynamic result
                    </p>
                    <p className="mt-4 text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl">
                      {formattedOutput}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                      {config.units[fromUnit].symbol} to {config.units[toUnit].symbol}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs ${statusClassName(statusSummary.state)}`}>
                        {statusSummary.title}
                      </span>
                      <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
                        precision {precision}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <button
                      type="button"
                      onClick={saveTemplate}
                      className="rounded-[1.2rem] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)]"
                      title="Save the current category, value, units, and precision as a reusable template"
                    >
                      {hasTemplate ? "Update template snapshot" : "Save current as template"}
                    </button>
                    <button
                      type="button"
                      onClick={copyShareLink}
                      className="rounded-[1.2rem] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)]"
                      title="Copy the current URL so the active configuration can be shared"
                    >
                      Shareable URL configuration
                    </button>
                  </div>

                  {config.disclaimer || conversion.approximate ? (
                    <div className="rounded-[1.2rem] border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
                      {config.disclaimer ??
                        "Approximate conversion. Validate against project standards before release use."}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 md:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
                      Workflow presets
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                      Apply common scenarios instantly
                    </h2>
                  </div>
                  <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
                    {categoryPresets.length} presets
                  </span>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {categoryPresets.length === 0 ? (
                    <p className="rounded-[1.2rem] border border-dashed border-[var(--border)] px-4 py-5 text-sm leading-6 text-[var(--muted)]">
                      No tuned presets for this category yet. Save the current
                      configuration as a template to build your own library.
                    </p>
                  ) : (
                    categoryPresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset)}
                        className="rounded-[1.3rem] border border-[var(--border)] bg-[var(--surface-3)] p-4 text-left transition hover:border-[var(--accent)] hover:bg-cyan-400/10"
                      >
                        <p className="text-sm font-semibold text-[var(--foreground)]">
                          {preset.label}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                          {preset.note}
                        </p>
                        <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[var(--accent-soft)]">
                          {preset.inputValue} {CATEGORY_CONFIGS[preset.category].units[preset.fromUnit].symbol} to{" "}
                          {CATEGORY_CONFIGS[preset.category].units[preset.toUnit].symbol}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 md:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
                      Visual feedback
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                      Trend and range view
                    </h2>
                  </div>
                  <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
                    live graph
                  </span>
                </div>

                <div className="mt-5">
                  <ConversionGraph
                    category={category}
                    fromUnit={fromUnit}
                    toUnit={toUnit}
                    inputValue={parsedValue}
                    precision={precision}
                  />
                </div>
              </div>
            </section>
          </div>

          <aside className="grid gap-5">
            <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">
                    sql view
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                    {recentsTableLabel}
                  </h2>
                </div>
                <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
                  session
                </span>
              </div>

              <div className="mt-5 overflow-hidden rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface-3)]">
                <div className="grid grid-cols-[90px_1fr_84px] gap-3 border-b border-[var(--border)] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                  <span>time</span>
                  <span>statement</span>
                  <span>mode</span>
                </div>
                <div className="grid gap-px bg-[var(--border)]">
                  {recents.length === 0 ? (
                    <div className="bg-[var(--surface)] px-4 py-5 text-sm leading-6 text-[var(--muted)]">
                      Live conversions will be logged here automatically.
                    </div>
                  ) : (
                    recents.map((entry) => (
                      <article
                        key={entry.id}
                        className="grid grid-cols-[90px_1fr_84px] gap-3 bg-[var(--surface)] px-4 py-4 text-sm"
                      >
                        <p className="font-mono text-xs text-[var(--muted)]">
                          {formatDateLabel(entry.createdAt)}
                        </p>
                        <div>
                          <p className="font-mono text-[13px] text-[var(--foreground)]">
                            SELECT output FROM {entry.category}
                          </p>
                          <p className="mt-2 leading-6 text-[var(--muted)]">
                            {formatRecentLabel(entry)}
                          </p>
                        </div>
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--accent-soft)]">
                          {entry.note}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">
                    sql view
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                    {templatesTableLabel}
                  </h2>
                </div>
                <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
                  local
                </span>
              </div>

              <div className="mt-5 grid gap-3">
                {templates.length === 0 ? (
                  <p className="rounded-[1.3rem] border border-dashed border-[var(--border)] px-4 py-5 text-sm leading-6 text-[var(--muted)]">
                    Save the current setup to create reusable templates for repeated
                    engineering checks.
                  </p>
                ) : (
                  templates.map((template) => (
                    <article
                      key={template.id}
                      className="rounded-[1.3rem] border border-[var(--border)] bg-[var(--surface-3)] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                            INSERT INTO {template.category}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">
                            {template.label}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                            Created {formatDateLabel(template.createdAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeTemplate(template.id)}
                          className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] transition hover:border-rose-300/50 hover:text-rose-100"
                        >
                          remove
                        </button>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => applyTemplate(template)}
                          className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)]"
                        >
                          Apply template
                        </button>
                        <span className="rounded-full border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
                          {template.inputValue} {CATEGORY_CONFIGS[template.category].units[template.fromUnit].symbol} to{" "}
                          {CATEGORY_CONFIGS[template.category].units[template.toUnit].symbol}
                        </span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 md:p-6">
              <details
                open={constantsOpen}
                onToggle={(event) =>
                  setConstantsOpen((event.target as HTMLDetailsElement).open)
                }
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
                      Reference data
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                      Engineering constants
                    </h2>
                  </div>
                  <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
                    {constantsOpen ? "open" : "closed"}
                  </span>
                </summary>
                <div className="mt-5 grid gap-3">
                  {config.constants.map((constant) => (
                    <article
                      key={constant.label}
                      className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface-3)] p-4"
                    >
                      <h3 className="text-sm font-semibold text-[var(--foreground)]">
                        {constant.label}
                      </h3>
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
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
