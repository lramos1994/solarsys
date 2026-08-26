export type Rgb = readonly [number, number, number];

/** Parse a three- or six-digit hexadecimal colour into RGB channels. */
export function parse(hex: string): Rgb {
  const normalized = hex.replace(/^#/, '');
  const expanded =
    normalized.length === 3
      ? `${normalized[0]}${normalized[0]}${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}`
      : normalized;

  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
}

/** Format RGB channels as PHP-compatible lowercase, clamped hexadecimal. */
export function toHex(red: number, green: number, blue: number): string {
  const channel = (value: number): string =>
    Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0');

  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

/** Move a colour toward white by proportion `amount`. */
export function tint(hex: string, amount: number): string {
  const [red, green, blue] = parse(hex);

  return toHex(
    red + (255 - red) * amount,
    green + (255 - green) * amount,
    blue + (255 - blue) * amount,
  );
}

/** Move a colour toward black by proportion `amount`. */
export function shade(hex: string, amount: number): string {
  const [red, green, blue] = parse(hex);

  return toHex(red * (1 - amount), green * (1 - amount), blue * (1 - amount));
}

/** Linearly interpolate two colours by proportion `amount`. */
export function mix(first: string, second: string, amount: number): string {
  const [firstRed, firstGreen, firstBlue] = parse(first);
  const [secondRed, secondGreen, secondBlue] = parse(second);

  return toHex(
    firstRed + (secondRed - firstRed) * amount,
    firstGreen + (secondGreen - firstGreen) * amount,
    firstBlue + (secondBlue - firstBlue) * amount,
  );
}

/** Format a hexadecimal colour and alpha component as a CSS rgba colour. */
export function rgba(hex: string, alpha: number): string {
  const [red, green, blue] = parse(hex);

  return `rgba(${red},${green},${blue},${alpha})`;
}

/** Shift a hexadecimal colour's HSL hue by `degrees`. */
export function hueShift(hex: string, degrees: number): string {
  const [red, green, blue] = parse(hex);
  const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
  const shiftedHue = ((hue + degrees / 360 + 1) % 1 + 1) % 1;
  const [shiftedRed, shiftedGreen, shiftedBlue] = hslToRgb(
    shiftedHue,
    saturation,
    lightness,
  );

  return toHex(shiftedRed, shiftedGreen, shiftedBlue);
}

function rgbToHsl(red: number, green: number, blue: number): Rgb {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;
  const maximum = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const minimum = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const lightness = (maximum + minimum) / 2;

  if (maximum === minimum) {
    return [0, 0, lightness];
  }

  const delta = maximum - minimum;
  const saturation =
    lightness > 0.5 ? delta / (2 - maximum - minimum) : delta / (maximum + minimum);
  let hue: number;

  if (maximum === normalizedRed) {
    hue = (normalizedGreen - normalizedBlue) / delta + (normalizedGreen < normalizedBlue ? 6 : 0);
  } else if (maximum === normalizedGreen) {
    hue = (normalizedBlue - normalizedRed) / delta + 2;
  } else {
    hue = (normalizedRed - normalizedGreen) / delta + 4;
  }

  return [hue / 6, saturation, lightness];
}

function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  if (saturation === 0) {
    const value = lightness * 255;

    return [value, value, value];
  }

  const upper =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const lower = 2 * lightness - upper;
  const channel = (offset: number): number => {
    const position = (hue + offset + 1) % 1;

    if (position < 1 / 6) return (lower + (upper - lower) * 6 * position) * 255;
    if (position < 1 / 2) return upper * 255;
    if (position < 2 / 3) return (lower + (upper - lower) * (2 / 3 - position) * 6) * 255;

    return lower * 255;
  };

  return [channel(1 / 3), channel(0), channel(-1 / 3)];
}
