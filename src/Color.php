<?php
namespace SolarSystemSvg;

class Color
{
    /** @return int[] [r,g,b] */
    public static function parse(string $hex): array
    {
        $hex = ltrim($hex, '#');
        if (strlen($hex) === 3) {
            $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
        }
        return [hexdec(substr($hex, 0, 2)), hexdec(substr($hex, 2, 2)), hexdec(substr($hex, 4, 2))];
    }

    public static function toHex($r, $g, $b): string
    {
        $c = fn($v) => str_pad(dechex(max(0, min(255, (int) round($v)))), 2, '0', STR_PAD_LEFT);
        return '#'.$c($r).$c($g).$c($b);
    }

    public static function tint(string $hex, float $p): string
    {
        [$r, $g, $b] = self::parse($hex);
        return self::toHex($r + (255 - $r) * $p, $g + (255 - $g) * $p, $b + (255 - $b) * $p);
    }

    public static function shade(string $hex, float $p): string
    {
        [$r, $g, $b] = self::parse($hex);
        return self::toHex($r * (1 - $p), $g * (1 - $p), $b * (1 - $p));
    }

    public static function mix(string $a, string $b, float $p): string
    {
        [$ar, $ag, $ab] = self::parse($a);
        [$br, $bg, $bb] = self::parse($b);
        return self::toHex($ar + ($br - $ar) * $p, $ag + ($bg - $ag) * $p, $ab + ($bb - $ab) * $p);
    }

    public static function rgba(string $hex, float $a): string
    {
        [$r, $g, $b] = self::parse($hex);
        return "rgba($r,$g,$b,$a)";
    }

    public static function hueShift(string $hex, float $deg): string
    {
        [$r, $g, $b] = self::parse($hex);
        [$h, $s, $l] = self::rgbToHsl($r, $g, $b);
        $h = fmod($h + $deg / 360.0 + 1.0, 1.0);
        [$r2, $g2, $b2] = self::hslToRgb($h, $s, $l);
        return self::toHex($r2, $g2, $b2);
    }

    private static function rgbToHsl($r, $g, $b): array
    {
        $r /= 255; $g /= 255; $b /= 255;
        $max = max($r, $g, $b); $min = min($r, $g, $b);
        $l = ($max + $min) / 2; $h = 0; $s = 0;
        if ($max !== $min) {
            $d = $max - $min;
            $s = $l > 0.5 ? $d / (2 - $max - $min) : $d / ($max + $min);
            if ($max === $r)      { $h = ($g - $b) / $d + ($g < $b ? 6 : 0); }
            elseif ($max === $g)  { $h = ($b - $r) / $d + 2; }
            else                  { $h = ($r - $g) / $d + 4; }
            $h /= 6;
        }
        return [$h, $s, $l];
    }

    private static function hslToRgb($h, $s, $l): array
    {
        if ($s == 0) { $v = $l * 255; return [$v, $v, $v]; }
        $hue2rgb = function ($p, $q, $t) {
            if ($t < 0) $t += 1; if ($t > 1) $t -= 1;
            if ($t < 1/6) return $p + ($q - $p) * 6 * $t;
            if ($t < 1/2) return $q;
            if ($t < 2/3) return $p + ($q - $p) * (2/3 - $t) * 6;
            return $p;
        };
        $q = $l < 0.5 ? $l * (1 + $s) : $l + $s - $l * $s;
        $p = 2 * $l - $q;
        return [$hue2rgb($p, $q, $h + 1/3) * 255, $hue2rgb($p, $q, $h) * 255, $hue2rgb($p, $q, $h - 1/3) * 255];
    }
}
