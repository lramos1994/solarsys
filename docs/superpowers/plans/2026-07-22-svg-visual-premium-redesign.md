# Premium SVG Visual Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevar consideravelmente o visual do SVG para um estilo flat/vetorial premium com paleta art-directed coesa por render e novos elementos (anéis, atmosfera, cinturão, cometas), mantendo PHP→SVG puro sem JS.

**Architecture:** Um `Theme` sorteia uma paleta coesa por render e deriva todas as cores por papel (via util `Color`). `Planet`/`SolarSystemSvg` consomem o `Theme`; novos elementos viram classes pequenas (`Ring`, `AsteroidBelt`, `Comet`). `SolarSystemSvg.render()` compõe as camadas em z-order deliberado.

**Tech Stack:** PHP 8.1, PSR-4 (`SolarSystemSvg\` → `src/`), SVG (SMIL/CSS para animação). Testes em PHP puro via harness próprio (sem PHPUnit).

## Global Constraints

- PHP→SVG puro. **Sem JS.** Sem libs externas de runtime (nem de teste — usar harness próprio).
- Namespace `SolarSystemSvg\`, arquivos em `src/` (autoload PSR-4 via `vendor/autoload.php`).
- Animação apenas SMIL (`animateMotion`, `animateTransform`) / CSS. **Nunca** `Date.now()`/JS.
- Coesão: numa mesma cena, todos os elementos derivam suas cores do **mesmo** `Theme`.
- Zero warnings/notices PHP no render (o harness converte qualquer aviso em falha).
- Meta de peso por render: ~150–300 KB (vs. 654 KB atuais).
- Preservar a API pública: `SolarSystemSvg::__construct($w,$h)`, `addPlanet($size,$distance,$moon=false)`, `render()`.
- Comentários de código em **inglês** (consistência com o codebase atual).

---

## File Structure

**Criar:**
- `tests/lib.php` — harness de asserção (assert helpers + summary + error handler).
- `src/Color.php` — util estático de cor (parse/tint/shade/mix/hueShift/rgba).
- `src/Theme.php` — motor de paleta art-directed.
- `src/Ring.php` — anel planetário com oclusão frente/trás.
- `src/AsteroidBelt.php` — faixa elíptica de asteroides.
- `src/Comet.php` — cometa com cauda + animação em loop.
- `tests/test_color.php`, `tests/test_theme.php`, `tests/test_ring.php`, `tests/test_belt.php`, `tests/test_comet.php`, `tests/test_planet.php`, `tests/test_integration.php`.

**Modificar:**
- `src/Planet.php` — rendering flat consumindo `Theme`; usa `Ring`.
- `src/SolarSystemSvg.php` — dono do `Theme`; sol/fundo flat; composição em z-order; cinturão + cometas.
- `index.php` — cena de demonstração (opcional: quais planetas têm anel).

**Interfaces (assinaturas que as tasks compartilham — mantenha idênticas):**

```
Color::parse(string $hex): array            // [r,g,b] ints
Color::toHex(int|float $r,$g,$b): string    // '#rrggbb'
Color::tint(string $hex, float $p): string
Color::shade(string $hex, float $p): string
Color::mix(string $a, string $b, float $p): string
Color::hueShift(string $hex, float $deg): string
Color::rgba(string $hex, float $a): string  // 'rgba(r,g,b,a)'

new Theme(?int $seed = null)
Theme::name(): string
Theme::background(): array   // ['layers'=>[ ['colors'=>[h,h,h,h],'cx'=>'%','cy'=>'%'], ... ], 'vignette'=>hex]
Theme::sun(): array          // ['bands'=>[h,h,h], 'glow'=>rgbaString, 'corona'=>hex]
Theme::planet(int $i): array // ['base'=>h,'light'=>h,'dark'=>h,'stains'=>[h,h,h],'atmosphere'=>rgbaString]
Theme::moon(int $i): array   // ['base'=>h,'light'=>h,'dark'=>h,'stains'=>[h,h,h]]
Theme::ring(): array         // ['bands'=>[h,h], 'gap'=>h]
Theme::star(): string        // hex
Theme::asteroid(): array     // ['fill'=>h,'stroke'=>h]
Theme::comet(): array        // ['head'=>h,'tail'=>h]

new Ring(float $r, string $id, array $ringTheme, float $tilt)
Ring::back(): string         // SVG desenhado ANTES do disco do planeta
Ring::front(): string        // SVG desenhado DEPOIS do disco do planeta

new AsteroidBelt(float $cx, float $cy, float $rx, float $ry, array $theme, int $count)
AsteroidBelt::defs(): string
AsteroidBelt::render(): string

new Comet(float $w, float $h, array $cometTheme, int $index)
Comet::defs(): string
Comet::render(): string
```

---

### Task 1: Test harness + `Color` util

**Files:**
- Create: `tests/lib.php`
- Create: `src/Color.php`
- Test: `tests/test_color.php`

**Interfaces:**
- Consumes: nada.
- Produces: `Color::{parse,toHex,tint,shade,mix,hueShift,rgba}` (assinaturas acima). O harness `tests/lib.php` expõe `t_ok/t_eq/t_contains/t_match/t_summary`.

- [ ] **Step 1: Write the test harness** `tests/lib.php`

```php
<?php
// Minimal PHP test harness (no external libs). Run each test with: php tests/test_x.php
$GLOBALS['T_PASS'] = 0; $GLOBALS['T_FAIL'] = 0; $GLOBALS['T_MSGS'] = [];

function t_ok(bool $cond, string $msg): void {
    if ($cond) { $GLOBALS['T_PASS']++; }
    else { $GLOBALS['T_FAIL']++; $GLOBALS['T_MSGS'][] = "FAIL: $msg"; }
}
function t_eq($a, $b, string $msg): void {
    t_ok($a === $b, "$msg (expected ".var_export($b, true).", got ".var_export($a, true).")");
}
function t_contains(string $haystack, string $needle, string $msg): void {
    t_ok(strpos($haystack, $needle) !== false, "$msg (missing '$needle')");
}
function t_match(string $haystack, string $regex, string $msg): void {
    t_ok(preg_match($regex, $haystack) === 1, "$msg (regex $regex did not match)");
}
function t_summary(): void {
    foreach ($GLOBALS['T_MSGS'] as $m) { fwrite(STDERR, $m."\n"); }
    echo "PASS={$GLOBALS['T_PASS']} FAIL={$GLOBALS['T_FAIL']}\n";
    exit($GLOBALS['T_FAIL'] === 0 ? 0 : 1);
}
// Turn any PHP warning/notice (e.g. undefined index) into a hard failure.
set_error_handler(function ($no, $str) { throw new ErrorException($str); });
```

- [ ] **Step 2: Write the failing test** `tests/test_color.php`

```php
<?php
require __DIR__ . '/lib.php';
require __DIR__ . '/../vendor/autoload.php';
use SolarSystemSvg\Color;

t_eq(Color::parse('#ffffff'), [255,255,255], 'parse white');
t_eq(Color::parse('#000'), [0,0,0], 'parse short black');
t_eq(Color::toHex(255,255,255), '#ffffff', 'toHex white');
t_eq(Color::toHex(-10, 300, 128), '#00ff80', 'toHex clamps');
t_eq(Color::tint('#000000', 0.5), '#808080', 'tint 50% of black');
t_eq(Color::shade('#ffffff', 0.5), '#808080', 'shade 50% of white');
t_eq(Color::mix('#000000', '#ffffff', 0.5), '#808080', 'mix midpoint');
t_match(Color::rgba('#3366cc', 0.4), '/^rgba\(51,102,204,0\.4\)$/', 'rgba format');
// hueShift by 360deg is identity (allow rounding within the same hex)
t_eq(Color::hueShift('#3366cc', 360), '#3366cc', 'hueShift 360 identity');
t_summary();
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `php tests/test_color.php`
Expected: FAIL — `Class "SolarSystemSvg\Color" not found`.

- [ ] **Step 4: Implement** `src/Color.php`

```php
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `php tests/test_color.php`
Expected: `PASS=9 FAIL=0`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/lib.php tests/test_color.php src/Color.php
git commit -m "feat: add Color util and PHP test harness"
```

---

### Task 2: `Theme` — motor de paleta art-directed

**Files:**
- Create: `src/Theme.php`
- Test: `tests/test_theme.php`

**Interfaces:**
- Consumes: `Color::*`.
- Produces: `Theme::{name,background,sun,planet,moon,ring,star,asteroid,comet}` (assinaturas acima).

- [ ] **Step 1: Write the failing test** `tests/test_theme.php`

```php
<?php
require __DIR__ . '/lib.php';
require __DIR__ . '/../vendor/autoload.php';
use SolarSystemSvg\Theme;

$hex = '/^#[0-9a-f]{6}$/';

// Determinism: same seed -> same theme name and same derived planet color.
$a = new Theme(123); $b = new Theme(123);
t_eq($a->name(), $b->name(), 'same seed -> same theme name');
t_eq($a->planet(0)['base'], $b->planet(0)['base'], 'same seed -> same planet base');

$t = new Theme(1);
t_match($t->planet(0)['base'], $hex, 'planet base is hex');
t_match($t->planet(0)['light'], $hex, 'planet light is hex');
t_match($t->planet(0)['dark'], $hex, 'planet dark is hex');
t_eq(count($t->planet(0)['stains']), 3, 'planet has 3 stains');
t_contains($t->planet(0)['atmosphere'], 'rgba(', 'atmosphere is rgba');
// Index wraps around planetHues without undefined index.
t_match($t->planet(99)['base'], $hex, 'planet index wraps');
t_match($t->sun()['bands'][0], $hex, 'sun band hex');
t_contains($t->sun()['glow'], 'rgba(', 'sun glow rgba');
t_eq(count($t->background()['layers']) >= 1, true, 'background has layers');
t_match($t->background()['vignette'], $hex, 'vignette hex');
t_match($t->ring()['bands'][0], $hex, 'ring band hex');
t_match($t->star(), $hex, 'star hex');
t_match($t->asteroid()['fill'], $hex, 'asteroid fill hex');
t_match($t->comet()['tail'], $hex, 'comet tail hex');
t_summary();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php tests/test_theme.php`
Expected: FAIL — `Class "SolarSystemSvg\Theme" not found`.

- [ ] **Step 3: Implement** `src/Theme.php`

```php
<?php
namespace SolarSystemSvg;

class Theme
{
    private array $p;      // chosen palette
    private string $name;

    // 6 cohesive palettes. planetHues são harmônicos dentro de cada tema.
    private static array $palettes = [
        'Aurora' => [
            'bg' => ['#0a1a2e', '#0e2a44', '#0a1830', '#050a18'],
            'sun' => '#ffd27a',
            'planetHues' => ['#4fa3c7', '#5ec6b0', '#7ea8e0', '#48c78e'],
            'accent' => '#7ef0d0',
            'stars' => ['#ffffff', '#bfe6ff', '#d8fff0'],
        ],
        'Ember' => [
            'bg' => ['#2a1010', '#3a1408', '#200a08', '#100405'],
            'sun' => '#ffb347',
            'planetHues' => ['#e8734a', '#e8a24a', '#c85a3a', '#d98a3a'],
            'accent' => '#ff9e6d',
            'stars' => ['#ffffff', '#ffe0c0', '#ffd0a0'],
        ],
        'Abissal' => [
            'bg' => ['#08161f', '#0a2230', '#061620', '#03080f'],
            'sun' => '#9fe0ff',
            'planetHues' => ['#2f8fb0', '#3aa0a0', '#4f7fb0', '#2fa08a'],
            'accent' => '#6fd0f0',
            'stars' => ['#ffffff', '#cfeaff', '#bfffff'],
        ],
        'Amethyst' => [
            'bg' => ['#1a0f2e', '#241145', '#160a2a', '#0a0518'],
            'sun' => '#e6b3ff',
            'planetHues' => ['#9a6ee0', '#b06ec8', '#7e6ee0', '#c86ea8'],
            'accent' => '#d0a0ff',
            'stars' => ['#ffffff', '#e6d0ff', '#f0d8ff'],
        ],
        'Verdant' => [
            'bg' => ['#0a2018', '#0e3024', '#082018', '#04120c'],
            'sun' => '#eaf0a0',
            'planetHues' => ['#4faa6e', '#6ec86e', '#3aa08a', '#8ac85e'],
            'accent' => '#a0f0a0',
            'stars' => ['#ffffff', '#e0ffd8', '#f0ffe0'],
        ],
        'Mono' => [
            'bg' => ['#14161a', '#1c2028', '#101216', '#08090c'],
            'sun' => '#f0f0f0',
            'planetHues' => ['#8a8f98', '#a0a4ac', '#727782', '#b8bcc4'],
            'accent' => '#d8dce4',
            'stars' => ['#ffffff', '#e0e4ec', '#c8ccd4'],
        ],
    ];

    public function __construct(?int $seed = null)
    {
        if ($seed !== null) { mt_srand($seed); }
        $names = array_keys(self::$palettes);
        $this->name = $names[mt_rand(0, count($names) - 1)];
        $this->p = self::$palettes[$this->name];
    }

    public function name(): string { return $this->name; }

    public function planet(int $i): array
    {
        $hues = $this->p['planetHues'];
        $base = $hues[$i % count($hues)];
        return [
            'base'  => $base,
            'light' => Color::tint($base, 0.35),
            'dark'  => Color::shade($base, 0.5),
            'stains' => [Color::shade($base, 0.6), Color::shade($base, 0.3), Color::hueShift($base, -14)],
            'atmosphere' => Color::rgba(Color::tint($base, 0.25), 0.35),
        ];
    }

    public function moon(int $i): array
    {
        $base = Color::mix($this->p['planetHues'][$i % count($this->p['planetHues'])], '#b8bcc4', 0.55);
        return [
            'base'  => $base,
            'light' => Color::tint($base, 0.3),
            'dark'  => Color::shade($base, 0.5),
            'stains' => [Color::shade($base, 0.55), Color::shade($base, 0.3), Color::shade($base, 0.7)],
        ];
    }

    public function sun(): array
    {
        $s = $this->p['sun'];
        return [
            'bands' => [Color::tint($s, 0.5), $s, Color::shade($s, 0.35)],
            'glow'  => Color::rgba($s, 0.35),
            'corona' => Color::shade($s, 0.15),
        ];
    }

    public function background(): array
    {
        $bg = $this->p['bg'];
        $layers = [];
        $spots = [['30%', '35%'], ['70%', '30%'], ['50%', '65%']];
        foreach ($spots as $k => $pos) {
            $layers[] = ['colors' => $bg, 'cx' => $pos[0], 'cy' => $pos[1]];
        }
        return ['layers' => $layers, 'vignette' => $bg[3]];
    }

    public function ring(): array
    {
        $a = $this->p['accent'];
        return ['bands' => [Color::tint($a, 0.2), Color::shade($a, 0.3)], 'gap' => Color::shade($a, 0.6)];
    }

    public function star(): string
    {
        $s = $this->p['stars'];
        return $s[mt_rand(0, count($s) - 1)];
    }

    public function asteroid(): array
    {
        $a = Color::shade($this->p['planetHues'][0], 0.45);
        return ['fill' => $a, 'stroke' => Color::shade($a, 0.4)];
    }

    public function comet(): array
    {
        $a = $this->p['accent'];
        return ['head' => Color::tint($a, 0.4), 'tail' => $a];
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `php tests/test_theme.php`
Expected: `PASS=15 FAIL=0`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add tests/test_theme.php src/Theme.php
git commit -m "feat: add Theme palette engine with 6 cohesive palettes"
```

---

### Task 3: `Planet` flat rendering consumindo `Theme`

Refatora `Planet` para o look flat: disco base + terminador chapado alinhado ao sol + continentes limpos + atmosfera + drop-shadow suave. `SolarSystemSvg` passa a criar um `Theme` e injetá-lo. Sol/fundo permanecem os atuais nesta task (serão trocados nas Tasks 5–6) — a cena continua renderizando.

**Files:**
- Modify: `src/Planet.php` (construtor recebe `Theme` + índice; `getPlanet()` reescrito)
- Modify: `src/SolarSystemSvg.php` (criar `Theme` no construtor; `addPlanet` passa `$theme` e índice sequencial)
- Test: `tests/test_planet.php`

**Interfaces:**
- Consumes: `Theme::planet()`, `Theme::moon()`.
- Produces: `new Planet($size, $distance, $moon, $system, Theme $theme, int $index)`; `getPlanet(): string`, `getOrbit(): string` (mantém). `SolarSystemSvg` expõe `public Theme $theme`.

- [ ] **Step 1: Write the failing test** `tests/test_planet.php`

```php
<?php
require __DIR__ . '/lib.php';
require __DIR__ . '/../vendor/autoload.php';
use SolarSystemSvg\SolarSystemSvg;
use SolarSystemSvg\Planet;
use SolarSystemSvg\Theme;

$theme = new Theme(7);
$sys = new SolarSystemSvg(300, 300);
// Render every planet index against a fixed theme; assert flat markers and no warnings.
for ($i = 0; $i < 12; $i++) {
    foreach ([false, ['size' => 3, 'distance' => 15]] as $moon) {
        $p = new Planet(10, 100, $moon, $sys, $theme, $i);
        $svg = $p->getPlanet();
        t_contains($svg, 'terminator-', "planet $i has flat terminator");
        t_contains($svg, 'atmosphere-', "planet $i has atmosphere ring");
        t_ok(strpos($svg, "fill='url(#grad-") === false, "planet $i uses flat fill, not radial grad");
    }
}
echo "planet flat OK\n";
t_summary();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php tests/test_planet.php`
Expected: FAIL — too many constructor args / `terminator-` not found.

- [ ] **Step 3: Rewrite** `src/Planet.php`

```php
<?php
namespace SolarSystemSvg;

class Planet
{
    public $id;
    public $size;
    public $distance;
    public $moon = false;
    public $system;
    public Theme $theme;
    public int $index;
    public bool $hasRing;

    public function __construct($size, $distance, $moon, $system, Theme $theme, int $index)
    {
        $this->size = $size;
        $this->distance = is_array($distance) ? $distance : [$distance, $distance, $distance, $distance];
        $this->moon = $moon;
        $this->system = $system;
        $this->theme = $theme;
        $this->index = $index;
        $this->id = uniqid((string) mt_rand(), true);
        // Rings assigned procedurally: larger planets are likelier to have one.
        $this->hasRing = ($size >= 6) && (mt_rand(0, 100) < 45);
    }

    // Clean, low-count continent blobs in a harmonized stain color.
    private function blobs(float $r, array $stains): string
    {
        $out = '';
        $count = mt_rand(3, 5);
        for ($c = 0; $c < $count; $c++) {
            $angle = mt_rand(0, 360) * M_PI / 180;
            $dist = mt_rand(0, intval($r * 6)) / 10;
            $cx = round(cos($angle) * $dist, 2);
            $cy = round(sin($angle) * $dist, 2);
            $size = $r * mt_rand(22, 42) / 100;
            $pts = mt_rand(6, 9);
            $coords = [];
            for ($i = 0; $i < $pts; $i++) {
                $a = ($i / $pts) * 2 * M_PI;
                $rad = $size * mt_rand(70, 115) / 100;
                $coords[] = [round($cx + cos($a) * $rad, 2), round($cy + sin($a) * $rad, 2)];
            }
            $n = count($coords);
            $sx = round(($coords[0][0] + $coords[1][0]) / 2, 2);
            $sy = round(($coords[0][1] + $coords[1][1]) / 2, 2);
            $path = "M $sx $sy";
            for ($i = 1; $i <= $n; $i++) {
                $p = $coords[$i % $n];
                $pn = $coords[($i + 1) % $n];
                $mx = round(($p[0] + $pn[0]) / 2, 2);
                $my = round(($p[1] + $pn[1]) / 2, 2);
                $path .= " Q {$p[0]} {$p[1]}, $mx $my";
            }
            $color = $stains[mt_rand(0, count($stains) - 1)];
            $out .= "<path d='$path Z' fill='$color' opacity='0.55' />";
        }
        return $out;
    }

    public function getOrbit()
    {
        $cx = $this->system->system['width'] / 2;
        $cy = $this->system->system['height'] / 2;
        [$left, $top, $right, $bottom] = $this->distance;
        $k = 0.5522847498;
        $kL = $left * $k; $kT = $top * $k; $kR = $right * $k; $kB = $bottom * $k;
        $path = "M " . ($cx - $left) . " $cy"
            . " C " . ($cx - $left) . " " . ($cy - $kT) . ", " . ($cx - $kL) . " " . ($cy - $top) . ", $cx " . ($cy - $top)
            . " C " . ($cx + $kR) . " " . ($cy - $top) . ", " . ($cx + $right) . " " . ($cy - $kT) . ", " . ($cx + $right) . " $cy"
            . " C " . ($cx + $right) . " " . ($cy + $kB) . ", " . ($cx + $kR) . " " . ($cy + $bottom) . ", $cx " . ($cy + $bottom)
            . " C " . ($cx - $kL) . " " . ($cy + $bottom) . ", " . ($cx - $left) . " " . ($cy + $kB) . ", " . ($cx - $left) . " $cy Z";
        $stroke = $this->system->debug
            ? "stroke='lightgrey' stroke-width='0.1'"
            : "stroke='" . Color::rgba('#ffffff', 0.06) . "' stroke-width='0.4'";
        return "<path fill='none' $stroke id='orbit-$this->id' d='$path' />";
    }

    public function getPlanet()
    {
        $r = $this->size;
        $id = $this->id;
        $st = $this->theme->planet($this->index);

        // Flat terminator: dark side is a disc-clipped ellipse offset toward anti-sun (down-right).
        $termId = "terminator-$id";
        $atmId = "atmosphere-$id";
        $clipId = "clip-$id";
        $shadowId = "drop-$id";

        $defs = "<defs>
            <clipPath id='$clipId'><circle cx='0' cy='0' r='$r' /></clipPath>
            <filter id='$shadowId' x='-50%' y='-50%' width='200%' height='200%'>
                <feGaussianBlur stdDeviation='" . round($r * 0.12, 2) . "' />
            </filter>
        </defs>";

        $termCx = round($r * 0.55, 2);
        $termCy = round($r * 0.35, 2);
        $termR = round($r * 1.15, 2);

        $body = "
            $defs
            <circle cx='0.6' cy='0.9' r='" . round($r * 1.15, 2) . "' fill='" . Color::rgba('#000000', 0.35) . "' filter='url(#$shadowId)' />
            <circle cx='0' cy='0' r='" . round($r * 1.18, 2) . "' fill='none' stroke='{$st['atmosphere']}' stroke-width='" . round($r * 0.16, 2) . "' id='$atmId' />
            <g clip-path='url(#$clipId)'>
                <circle cx='0' cy='0' r='$r' fill='{$st['base']}' />
                <circle cx='" . round(-$r * 0.35, 2) . "' cy='" . round(-$r * 0.35, 2) . "' r='" . round($r * 0.9, 2) . "' fill='{$st['light']}' opacity='0.5' />
                " . $this->blobs($r, $st['stains']) . "
                <circle cx='$termCx' cy='$termCy' r='$termR' fill='{$st['dark']}' opacity='0.55' id='$termId' />
            </g>";

        $moon = $this->moonMarkup($id);

        $dur = mt_rand(20, 60);
        $offset = round($dur * mt_rand(0, 100) / 100, 2);

        // NOTE: rings are wired into this method in Task 4 (Ring class does not exist yet).
        return "<g>
            <g>
                $body
                $moon
            </g>
            <animateMotion dur='{$dur}s' begin='-{$offset}s' repeatCount='indefinite'>
                <mpath xlink:href='#orbit-$this->id' />
            </animateMotion>
        </g>";
    }

    private function moonMarkup(string $planetId): string
    {
        if (!$this->moon) { return ''; }
        $ms = $this->theme->moon($this->index);
        $sz = $this->moon['size'];
        $md = $this->moon['distance'];
        $mk = $md * 0.5522847498;
        $mid = "moon-$planetId";
        $orbit = "M -$md 0 C -$md -$mk, -$mk -$md, 0 -$md S $md -$mk, $md 0 S $mk $md, 0 $md S -$md $mk, -$md 0 Z";
        $off = round(15 * mt_rand(0, 100) / 100, 2);
        $stroke = $this->system->debug ? "stroke='lightgrey' stroke-width='0.5'" : "stroke='none'";
        return "
            <path fill='none' $stroke d='$orbit' id='planet-$planetId'></path>
            <g>
                <clipPath id='clip-$mid'><circle cx='0' cy='0' r='$sz' /></clipPath>
                <circle cx='0.4' cy='0.5' r='" . round($sz * 1.2, 2) . "' fill='" . Color::rgba('#000000', 0.3) . "' />
                <g clip-path='url(#clip-$mid)'>
                    <circle cx='0' cy='0' r='$sz' fill='{$ms['base']}' />
                    <circle cx='" . round(-$sz * 0.3, 2) . "' cy='" . round(-$sz * 0.3, 2) . "' r='" . round($sz * 0.8, 2) . "' fill='{$ms['light']}' opacity='0.5' />
                    <circle cx='" . round($sz * 0.5, 2) . "' cy='" . round($sz * 0.35, 2) . "' r='" . round($sz * 1.1, 2) . "' fill='{$ms['dark']}' opacity='0.5' />
                </g>
                <animateMotion keyPoints='1;0' keyTimes='0;1' dur='15s' begin='-{$off}s' repeatCount='indefinite'>
                    <mpath xlink:href='#planet-$planetId' />
                </animateMotion>
            </g>";
    }
}
```

- [ ] **Step 4: Update** `src/SolarSystemSvg.php` — criar `Theme` e injetar em `Planet` (mudança mínima; sol/fundo inalterados por ora)

Modificar a propriedade e o `addPlanet`:

```php
    public Theme $theme;
    public $planetIndex = 0;

    public function __construct($width = 100, $height = 100)
    {
        $this->sun = ['size' => (($width + $height) / 2.5) * 0.05];
        $this->system = ['width' => $width, 'height' => $height];
        $this->theme = new Theme();
    }

    public function addPlanet($size, $distance, $moon = false)
    {
        $planet = new Planet($size, $distance, $moon, $this, $this->theme, $this->planetIndex++);
        $this->planets[] = $planet;
    }
```

(Nesta task, `getBackground()` e o sol em `render()` continuam como estão — a cena renderiza sem quebrar.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `php tests/test_planet.php`
Expected: `planet flat OK` + `PASS=... FAIL=0`, exit 0.

- [ ] **Step 6: Run the existing smoke render (no PHP errors end-to-end)**

Run: `php -r 'require "vendor/autoload.php"; $s=new SolarSystemSvg\SolarSystemSvg(300,300); $s->addPlanet(10,[150,60,150,60],["size"=>3,"distance"=>25]); $s->addPlanet(5,55,["size"=>2,"distance"=>10]); echo strlen($s->render()),"\n";'`
Expected: prints a byte count, no warnings/fatals.

- [ ] **Step 7: Commit**

```bash
git add tests/test_planet.php src/Planet.php src/SolarSystemSvg.php
git commit -m "feat: flat premium planet rendering driven by Theme"
```

---

### Task 4: `Ring` — anel com oclusão frente/trás (+ wiring no `Planet`)

**Files:**
- Create: `src/Ring.php`
- Modify: `src/Planet.php` (`getPlanet()` passa a instanciar `Ring` quando `hasRing`)
- Test: `tests/test_ring.php`, `tests/test_planet_ring.php`

**Interfaces:**
- Consumes: `Theme::ring()` array `['bands'=>[h,h],'gap'=>h]`.
- Produces: `new Ring(float $r, string $id, array $ringTheme, float $tilt)`; `back(): string`, `front(): string`.

- [ ] **Step 1: Write the failing test** `tests/test_ring.php`

```php
<?php
require __DIR__ . '/lib.php';
require __DIR__ . '/../vendor/autoload.php';
use SolarSystemSvg\Ring;

$ring = new Ring(10, 'abc', ['bands' => ['#cccccc', '#888888'], 'gap' => '#333333'], 0.25);
$back = $ring->back();
$front = $ring->front();
t_contains($back, '<ellipse', 'back is an ellipse');
t_contains($front, '<path', 'front is a clipped path arc');
t_contains($front, 'clipPath', 'front uses a clip to occlude behind planet');
t_ok(strlen($back) > 0 && strlen($front) > 0, 'both halves render');
t_summary();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php tests/test_ring.php`
Expected: FAIL — `Class "SolarSystemSvg\Ring" not found`.

- [ ] **Step 3: Implement** `src/Ring.php`

```php
<?php
namespace SolarSystemSvg;

class Ring
{
    private float $r;
    private string $id;
    private array $t;      // ring theme: bands[2], gap
    private float $tilt;   // ry/rx ratio (0..1), smaller = flatter

    public function __construct(float $r, string $id, array $ringTheme, float $tilt)
    {
        $this->r = $r;
        $this->id = $id;
        $this->t = $ringTheme;
        $this->tilt = max(0.12, min(0.4, $tilt));
    }

    private function rx(): float { return round($this->r * 2.1, 2); }
    private function ry(): float { return round($this->r * 2.1 * $this->tilt, 2); }

    // Full ring ellipse, drawn behind the planet disc.
    public function back(): string
    {
        $rx = $this->rx(); $ry = $this->ry();
        return "<g transform='rotate(-18)'>
            <ellipse cx='0' cy='0' rx='$rx' ry='$ry' fill='none' stroke='{$this->t['bands'][1]}' stroke-width='" . round($this->r * 0.5, 2) . "' opacity='0.85' />
            <ellipse cx='0' cy='0' rx='" . round($rx * 0.82, 2) . "' ry='" . round($ry * 0.82, 2) . "' fill='none' stroke='{$this->t['gap']}' stroke-width='" . round($this->r * 0.18, 2) . "' opacity='0.6' />
            <ellipse cx='0' cy='0' rx='" . round($rx * 0.66, 2) . "' ry='" . round($ry * 0.66, 2) . "' fill='none' stroke='{$this->t['bands'][0]}' stroke-width='" . round($this->r * 0.28, 2) . "' opacity='0.9' />
        </g>";
    }

    // Front half: same ellipse clipped to the lower band (in front of the planet).
    public function front(): string
    {
        $rx = $this->rx(); $ry = $this->ry();
        $clip = "ring-clip-{$this->id}";
        $big = round($this->r * 4, 2);
        return "<g transform='rotate(-18)'>
            <clipPath id='$clip'><rect x='-$big' y='0' width='" . ($big * 2) . "' height='$big' /></clipPath>
            <g clip-path='url(#$clip)'>
                <path d='M -$rx 0 A $rx $ry 0 0 0 $rx 0' fill='none' stroke='{$this->t['bands'][1]}' stroke-width='" . round($this->r * 0.5, 2) . "' opacity='0.95' />
                <path d='M " . round(-$rx * 0.66, 2) . " 0 A " . round($rx * 0.66, 2) . " " . round($ry * 0.66, 2) . " 0 0 0 " . round($rx * 0.66, 2) . " 0' fill='none' stroke='{$this->t['bands'][0]}' stroke-width='" . round($this->r * 0.28, 2) . "' opacity='1' />
            </g>
        </g>";
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `php tests/test_ring.php`
Expected: `PASS=4 FAIL=0`, exit 0.

- [ ] **Step 5: Write the failing wiring test** `tests/test_planet_ring.php`

```php
<?php
require __DIR__ . '/lib.php';
require __DIR__ . '/../vendor/autoload.php';
use SolarSystemSvg\SolarSystemSvg;
use SolarSystemSvg\Planet;
use SolarSystemSvg\Theme;

$theme = new Theme(3);
$sys = new SolarSystemSvg(300, 300);
$found = false;
for ($i = 0; $i < 60; $i++) {
    $p = new Planet(10, 100, false, $sys, $theme, $i); // size 10 -> eligible for rings
    $svg = $p->getPlanet();
    if (strpos($svg, 'ring-clip-') !== false) {
        $found = true;
        t_contains($svg, '<ellipse', 'ringed planet draws back ellipse');
    }
}
t_ok($found, 'at least one of 60 size-10 planets has a ring');
t_summary();
```

- [ ] **Step 6: Run to verify it fails**

Run: `php tests/test_planet_ring.php`
Expected: FAIL — `ring-clip-` never appears (Planet does not yet render rings).

- [ ] **Step 7: Wire `Ring` into** `src/Planet.php` `getPlanet()`

Substituir o bloco final de `getPlanet()` (marcado com a NOTE da Task 3) por:

```php
        $ringBack = '';
        $ringFront = '';
        if ($this->hasRing) {
            $ringObj = new Ring($r, $this->id, $this->theme->ring(), mt_rand(15, 32) / 100);
            $ringBack = $ringObj->back();
            $ringFront = $ringObj->front();
        }

        return "<g>
            $ringBack
            <g>
                $body
                $ringFront
                $moon
            </g>
            <animateMotion dur='{$dur}s' begin='-{$offset}s' repeatCount='indefinite'>
                <mpath xlink:href='#orbit-$this->id' />
            </animateMotion>
        </g>";
```

- [ ] **Step 8: Run all planet/ring tests to verify pass**

Run: `php tests/test_ring.php && php tests/test_planet_ring.php && php tests/test_planet.php`
Expected: todos `FAIL=0`.

- [ ] **Step 9: Commit**

```bash
git add tests/test_ring.php tests/test_planet_ring.php src/Ring.php src/Planet.php
git commit -m "feat: add planetary Ring with front/back occlusion and wire into Planet"
```

---

### Task 5: Sol flat (bandas + coroa) via `Theme`

**Files:**
- Modify: `src/SolarSystemSvg.php` (`render()` — bloco do sol)
- Test: estende `tests/test_integration.php` (criado na Task 9) — por ora, verificação por comando.

**Interfaces:**
- Consumes: `Theme::sun()` `['bands'=>[h,h,h],'glow'=>rgba,'corona'=>h]`.
- Produces: markup do sol dentro de `render()`.

- [ ] **Step 1: Substituir o `sunDefs`/desenho do sol em `render()`**

No `render()`, trocar o bloco atual do sol (gradiente + manchas) por bandas chapadas + coroa + glow:

```php
        $sunR = $this->sun['size'];
        $sunCx = $this->system['width'] / 2;
        $sunCy = $this->system['height'] / 2;
        $sunT = $this->theme->sun();
        $glowR = $sunR * 3;

        $sun = "
            <circle cx='$sunCx' cy='$sunCy' r='$glowR' fill='" . $sunT['glow'] . "' />
            <circle cx='$sunCx' cy='$sunCy' r='" . round($sunR * 1.35, 2) . "' fill='none' stroke='{$sunT['corona']}' stroke-width='" . round($sunR * 0.12, 2) . "' opacity='0.5' />
            <circle cx='$sunCx' cy='$sunCy' r='$sunR' fill='{$sunT['bands'][2]}' />
            <circle cx='$sunCx' cy='$sunCy' r='" . round($sunR * 0.8, 2) . "' fill='{$sunT['bands'][1]}' />
            <circle cx='" . round($sunCx - $sunR * 0.25, 2) . "' cy='" . round($sunCy - $sunR * 0.25, 2) . "' r='" . round($sunR * 0.5, 2) . "' fill='{$sunT['bands'][0]}' />";
```

E no retorno do `render()`, usar `$sun` no lugar do grupo do sol atual (dentro do `<g transform='translate(2.5 2.5)'>`, após as órbitas). Remover o `$sunDefs`, `$sunStains` e o `<clipPath id="sun-clip">` antigos.

- [ ] **Step 2: Verify render (sol flat, sem erros)**

Run: `php -r 'require "vendor/autoload.php"; $s=new SolarSystemSvg\SolarSystemSvg(300,300); $s->addPlanet(5,55,false); $o=$s->render(); echo (strpos($o,"sun-grad")===false?"no-old-sun-grad ":"OLD-SUN "); echo strlen($o),"\n";'`
Expected: `no-old-sun-grad <bytes>` — sem warnings.

- [ ] **Step 3: Commit**

```bash
git add src/SolarSystemSvg.php
git commit -m "feat: flat banded sun with corona and themed glow"
```

---

### Task 6: Fundo flat — nebulosa coesa + estrelas otimizadas + vinheta

Troca as ~6.000 estrelas soltas por `<symbol>`+`<use>` em 3 tiers com contagem reduzida; nebulosa e estrelas saem do `Theme`; adiciona vinheta.

**Files:**
- Modify: `src/SolarSystemSvg.php` (`getBackground()`)
- Test: `tests/test_integration.php` (Task 9) cobre peso; verificação por comando aqui.

**Interfaces:**
- Consumes: `Theme::background()`, `Theme::star()`.
- Produces: `getBackground(): string`.

- [ ] **Step 1: Reescrever** `getBackground()`

```php
    public function getBackground()
    {
        $w = $this->system['width'] + 5;
        $h = $this->system['height'] + 5;
        $bg = $this->theme->background();

        $defs = "<defs>
            <symbol id='star-s' viewBox='-1 -1 2 2'><circle cx='0' cy='0' r='1' /></symbol>
            <radialGradient id='star-glow'>
                <stop offset='0%' stop-color='white' stop-opacity='0.18' />
                <stop offset='100%' stop-color='white' stop-opacity='0' />
            </radialGradient>
            <radialGradient id='vignette' cx='50%' cy='50%' r='75%'>
                <stop offset='55%' stop-color='" . Color::rgba($bg['vignette'], 0) . "' />
                <stop offset='100%' stop-color='" . Color::rgba(Color::shade($bg['vignette'], 0.4), 0.85) . "' />
            </radialGradient>";
        foreach ($bg['layers'] as $i => $l) {
            $c = $l['colors'];
            $op = $i === 0 ? '1' : '0.5';
            $defs .= "<radialGradient id='space-bg-$i' cx='{$l['cx']}' cy='{$l['cy']}' r='80%'>
                <stop offset='0%' stop-color='{$c[0]}' stop-opacity='$op' />
                <stop offset='45%' stop-color='{$c[1]}' stop-opacity='" . ($i === 0 ? '1' : '0.35') . "' />
                <stop offset='100%' stop-color='{$c[3]}' stop-opacity='" . ($i === 0 ? '1' : '0') . "' />
            </radialGradient>";
        }
        $defs .= "</defs>";

        $out = $defs;
        foreach ($bg['layers'] as $i => $l) {
            $out .= "<rect width='$w' height='$h' fill='url(#space-bg-$i)' />";
        }

        // Optimized stars: 3 size tiers, reduced counts, via <use>.
        $tiers = [[intval($w * $h / 90), 0.35, 0.5], [intval($w * $h / 220), 0.7, 0.8], [intval($w * $h / 900), 1.2, 1.0]];
        foreach ($tiers as $tier) {
            [$count, $scale, $op] = $tier;
            for ($i = 0; $i < $count; $i++) {
                $x = mt_rand(0, $w * 10) / 10;
                $y = mt_rand(0, $h * 10) / 10;
                $s = round($scale * mt_rand(70, 130) / 100, 2);
                $out .= "<use href='#star-s' x='0' y='0' fill='" . $this->theme->star() . "' opacity='$op' transform='translate($x $y) scale($s)' />";
            }
        }
        // A few bright accent stars with glow.
        $bright = mt_rand(4, 7);
        for ($i = 0; $i < $bright; $i++) {
            $x = mt_rand(0, $w * 10) / 10; $y = mt_rand(0, $h * 10) / 10;
            $out .= "<circle cx='$x' cy='$y' r='" . mt_rand(15, 30) / 10 . "' fill='url(#star-glow)' />";
            $out .= "<use href='#star-s' fill='#ffffff' transform='translate($x $y) scale(0.6)' />";
        }

        $out .= "<rect width='$w' height='$h' fill='url(#vignette)' />";
        return $out;
    }
```

- [ ] **Step 2: Verify weight dropped and no errors**

Run: `php -r 'require "vendor/autoload.php"; $s=new SolarSystemSvg\SolarSystemSvg(300,300); $s->addPlanet(5,55,false); $b=strlen($s->render()); echo $b," bytes\n"; exit($b < 350000 ? 0 : 1);'`
Expected: prints bytes < 350000, exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/SolarSystemSvg.php
git commit -m "perf,feat: themed nebula + tiered <use> stars + vignette"
```

---

### Task 7: `AsteroidBelt`

**Files:**
- Create: `src/AsteroidBelt.php`
- Modify: `src/SolarSystemSvg.php` (instanciar + compor — feito na Task 9; aqui só a classe + defs)
- Test: `tests/test_belt.php`

**Interfaces:**
- Consumes: `Theme::asteroid()` `['fill'=>h,'stroke'=>h]`.
- Produces: `new AsteroidBelt(float $cx, float $cy, float $rx, float $ry, array $theme, int $count)`; `defs(): string`, `render(): string`.

- [ ] **Step 1: Write the failing test** `tests/test_belt.php`

```php
<?php
require __DIR__ . '/lib.php';
require __DIR__ . '/../vendor/autoload.php';
use SolarSystemSvg\AsteroidBelt;

$belt = new AsteroidBelt(150, 150, 120, 120, ['fill' => '#888', 'stroke' => '#444'], 60);
$defs = $belt->defs();
$svg = $belt->render();
t_contains($defs, '<symbol', 'defs define asteroid symbol(s)');
$uses = substr_count($svg, '<use');
t_ok($uses === 60, "renders exactly 60 asteroids (got $uses)");
t_contains($svg, 'animateTransform', 'belt drifts');
t_summary();
```

- [ ] **Step 2: Run to verify it fails**

Run: `php tests/test_belt.php`
Expected: FAIL — class not found.

- [ ] **Step 3: Implement** `src/AsteroidBelt.php`

```php
<?php
namespace SolarSystemSvg;

class AsteroidBelt
{
    private float $cx, $cy, $rx, $ry;
    private array $t;
    private int $count;

    public function __construct(float $cx, float $cy, float $rx, float $ry, array $theme, int $count)
    {
        $this->cx = $cx; $this->cy = $cy; $this->rx = $rx; $this->ry = $ry;
        $this->t = $theme; $this->count = max(0, min(400, $count));
    }

    public function defs(): string
    {
        return "<defs>
            <symbol id='ast-a' viewBox='-1 -1 2 2'><polygon points='0.9,0 0.3,0.7 -0.6,0.6 -0.9,-0.2 -0.2,-0.8' /></symbol>
            <symbol id='ast-b' viewBox='-1 -1 2 2'><polygon points='0.8,0.2 0.1,0.9 -0.8,0.3 -0.5,-0.6 0.4,-0.7' /></symbol>
        </defs>";
    }

    public function render(): string
    {
        $bodies = '';
        for ($i = 0; $i < $this->count; $i++) {
            $a = ($i / max(1, $this->count)) * 2 * M_PI + (mt_rand(-30, 30) / 100);
            $jitter = mt_rand(-40, 40) / 10;
            $x = round($this->cx + cos($a) * ($this->rx + $jitter), 2);
            $y = round($this->cy + sin($a) * ($this->ry + $jitter), 2);
            $s = mt_rand(6, 16) / 10;
            $sym = mt_rand(0, 1) ? 'ast-a' : 'ast-b';
            $rot = mt_rand(0, 360);
            $op = mt_rand(50, 90) / 100;
            $bodies .= "<use href='#$sym' fill='{$this->t['fill']}' stroke='{$this->t['stroke']}' stroke-width='0.15' opacity='$op' transform='translate($x $y) scale($s) rotate($rot)' />";
        }
        $dur = mt_rand(120, 240);
        return "<g>
            <animateTransform attributeName='transform' type='rotate' from='0 {$this->cx} {$this->cy}' to='360 {$this->cx} {$this->cy}' dur='{$dur}s' repeatCount='indefinite' />
            $bodies
        </g>";
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `php tests/test_belt.php`
Expected: `PASS=3 FAIL=0`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add tests/test_belt.php src/AsteroidBelt.php
git commit -m "feat: add AsteroidBelt with drifting themed bodies"
```

---

### Task 8: `Comet`

**Files:**
- Create: `src/Comet.php`
- Test: `tests/test_comet.php`

**Interfaces:**
- Consumes: `Theme::comet()` `['head'=>h,'tail'=>h]`.
- Produces: `new Comet(float $w, float $h, array $cometTheme, int $index)`; `defs(): string`, `render(): string`.

- [ ] **Step 1: Write the failing test** `tests/test_comet.php`

```php
<?php
require __DIR__ . '/lib.php';
require __DIR__ . '/../vendor/autoload.php';
use SolarSystemSvg\Comet;

$c = new Comet(300, 300, ['head' => '#fff', 'tail' => '#7ef0d0'], 0);
$defs = $c->defs();
$svg = $c->render();
t_contains($defs, 'linearGradient', 'tail uses a gradient in defs');
t_contains($svg, '<animateMotion', 'comet moves via animateMotion');
t_contains($svg, 'repeatCount=\'indefinite\'', 'comet loops');
t_summary();
```

- [ ] **Step 2: Run to verify it fails**

Run: `php tests/test_comet.php`
Expected: FAIL — class not found.

- [ ] **Step 3: Implement** `src/Comet.php`

```php
<?php
namespace SolarSystemSvg;

class Comet
{
    private float $w, $h;
    private array $t;
    private int $i;

    public function __construct(float $w, float $h, array $cometTheme, int $index)
    {
        $this->w = $w; $this->h = $h; $this->t = $cometTheme; $this->i = $index;
    }

    public function defs(): string
    {
        return "<defs>
            <linearGradient id='comet-tail-{$this->i}' x1='0' y1='0' x2='1' y2='0'>
                <stop offset='0%' stop-color='" . Color::rgba($this->t['tail'], 0) . "' />
                <stop offset='100%' stop-color='" . Color::rgba($this->t['tail'], 0.9) . "' />
            </linearGradient>
        </defs>";
    }

    public function render(): string
    {
        // Diagonal path across the scene, off-screen to off-screen.
        $y0 = mt_rand(0, intval($this->h));
        $y1 = mt_rand(0, intval($this->h));
        $path = "M -20 $y0 L " . ($this->w + 20) . " $y1";
        $dur = mt_rand(6, 12);
        $begin = -1 * $this->i * mt_rand(3, 8);
        $tailLen = mt_rand(14, 26);
        $comet = "<g>
            <polygon points='0,0 -$tailLen,-1.4 -$tailLen,1.4' fill='url(#comet-tail-{$this->i})' />
            <circle cx='0' cy='0' r='1.8' fill='{$this->t['head']}' />
            <animateMotion dur='{$dur}s' begin='{$begin}s' repeatCount='indefinite' rotate='auto' path='$path' />
        </g>";
        return $comet;
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `php tests/test_comet.php`
Expected: `PASS=3 FAIL=0`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add tests/test_comet.php src/Comet.php
git commit -m "feat: add looping Comet with tapered themed tail"
```

---

### Task 9: Composição em z-order + integração final + verificação

Monta tudo em `render()` na ordem correta e adiciona cinturão + cometas. Teste de integração cobre todos os temas, presença de elementos, boa-formação e peso.

**Files:**
- Modify: `src/SolarSystemSvg.php` (`render()` compõe camadas; instancia belt + comets)
- Modify: `index.php` (cena de demo)
- Test: `tests/test_integration.php`

**Interfaces:**
- Consumes: tudo acima.
- Produces: `render(): string` final.

- [ ] **Step 1: Write the failing integration test** `tests/test_integration.php`

```php
<?php
require __DIR__ . '/lib.php';
require __DIR__ . '/../vendor/autoload.php';
use SolarSystemSvg\SolarSystemSvg;

// Force each of the 6 themes by seeding, render a full scene, assert invariants.
for ($seed = 0; $seed < 30; $seed++) {
    mt_srand($seed);
    $s = new SolarSystemSvg(300, 300);
    $s->addPlanet(10, [150, 60, 150, 60], ['size' => 3, 'distance' => 25]);
    $s->addPlanet(6, 55, ['size' => 2, 'distance' => 10]);
    $s->addPlanet(4, 35, false);
    $s->addPlanet(8, 150, ['size' => 3, 'distance' => 8]);
    $out = $s->render();

    t_eq(substr_count($out, '<svg'), 1, "seed $seed: exactly one <svg>");
    t_eq(substr_count($out, '<g'), substr_count($out, '</g>'), "seed $seed: balanced <g>");
    t_contains($out, 'ast-a', "seed $seed: asteroid belt present");
    t_contains($out, 'comet-tail-', "seed $seed: comet present");
    t_contains($out, 'terminator-', "seed $seed: flat planets present");
    t_contains($out, 'vignette', "seed $seed: vignette present");
    t_ok(strlen($out) < 320000, "seed $seed: under weight budget (" . strlen($out) . ")");
}
echo "integration OK\n";
t_summary();
```

- [ ] **Step 2: Run to verify it fails**

Run: `php tests/test_integration.php`
Expected: FAIL — no `ast-a`/`comet-tail-` yet (belt/comets not composed).

- [ ] **Step 3: Rewrite** `render()` para compor em z-order + belt + cometas

```php
    public function render()
    {
        $orbits = $this->getOrbitsPath();
        $planets = $this->getPlanets();
        $background = $this->debug ? '' : $this->getBackground();

        $cx = $this->system['width'] / 2;
        $cy = $this->system['height'] / 2;
        $w = $this->system['width'];
        $h = $this->system['height'];

        // Sun (flat banded) — from Task 5.
        $sunR = $this->sun['size'];
        $sunT = $this->theme->sun();
        $glowR = $sunR * 3;
        $sun = "
            <circle cx='$cx' cy='$cy' r='$glowR' fill='" . $sunT['glow'] . "' />
            <circle cx='$cx' cy='$cy' r='" . round($sunR * 1.35, 2) . "' fill='none' stroke='{$sunT['corona']}' stroke-width='" . round($sunR * 0.12, 2) . "' opacity='0.5' />
            <circle cx='$cx' cy='$cy' r='$sunR' fill='{$sunT['bands'][2]}' />
            <circle cx='$cx' cy='$cy' r='" . round($sunR * 0.8, 2) . "' fill='{$sunT['bands'][1]}' />
            <circle cx='" . round($cx - $sunR * 0.25, 2) . "' cy='" . round($cy - $sunR * 0.25, 2) . "' r='" . round($sunR * 0.5, 2) . "' fill='{$sunT['bands'][0]}' />";

        // Asteroid belt (between two orbits) + comets.
        $belt = new AsteroidBelt($cx, $cy, $w * 0.42, $h * 0.42, $this->theme->asteroid(), $this->debug ? 0 : 90);
        $numComets = $this->debug ? 0 : mt_rand(1, 3);
        $cometDefs = ''; $cometMarkup = '';
        for ($i = 0; $i < $numComets; $i++) {
            $c = new Comet($w, $h, $this->theme->comet(), $i);
            $cometDefs .= $c->defs();
            $cometMarkup .= $c->render();
        }

        $bg = $this->debug ? '#fff' : '#000';
        return '
        <svg class="solarsys" style="background:' . $bg . '" viewBox="0 0 ' . ($w + 5) . ' ' . ($h + 5) . '" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            ' . $background . '
            ' . $belt->defs() . $cometDefs . '
            <g transform="translate(2.5 2.5)">
                ' . $belt->render() . '
                ' . implode($orbits) . '
                ' . $sun . '
                ' . implode($planets) . '
                ' . $cometMarkup . '
            </g>
        </svg>';
    }
```

(Remover do `render()` quaisquer restos do sol antigo/`$sunDefs`/`$sunStains`.)

- [ ] **Step 4: Update** `index.php` (cena de demo — sem 5º planeta experimental)

```php
<?php
use SolarSystemSvg\SolarSystemSvg;
require_once __DIR__ . '/vendor/autoload.php';

$system = new SolarSystemSvg(300, 300);
$system->addPlanet(10, [150, 60, 150, 60], ['size' => 3, 'distance' => 25]);
$system->addPlanet(6, 55, ['size' => 2, 'distance' => 10]);
$system->addPlanet(4, 35, false);
$system->addPlanet(8, 150, ['size' => 3, 'distance' => 8]);
?>

<div style="width:750px;border: 1px solid;background: #000;">
    <?php echo $system->render(); ?>
</div>

<link rel="stylesheet" href="/dist/styles/main.css">
```

- [ ] **Step 5: Run the integration test**

Run: `php tests/test_integration.php`
Expected: `integration OK` + `FAIL=0`, exit 0.

- [ ] **Step 6: Run ALL tests + well-formedness (xmllint if available)**

Run:
```bash
for f in tests/test_*.php; do echo "== $f =="; php "$f" || exit 1; done
php -r 'require "vendor/autoload.php"; $s=new SolarSystemSvg\SolarSystemSvg(300,300); $s->addPlanet(8,80,false); file_put_contents("/tmp/out.svg", preg_replace("/^.*?(<svg)/s","$1", $s->render()));'
command -v xmllint >/dev/null && xmllint --noout /tmp/out.svg && echo "well-formed" || echo "xmllint absent (skip)"
```
Expected: todos `FAIL=0`; `well-formed` (ou skip).

- [ ] **Step 7: Visual check (manual)** — subir o servidor e abrir no browser

Run: `php -S 0.0.0.0:8000 -t . &` então abrir `http://localhost:8000`. Confirmar: paleta coesa, planetas flat com terminador, anéis, atmosfera, cinturão girando, cometas, fundo com vinheta. Cada refresh muda de tema mantendo harmonia.

- [ ] **Step 8: Commit**

```bash
git add src/SolarSystemSvg.php index.php tests/test_integration.php
git commit -m "feat: compose scene in z-order with belt, comets, vignette"
```

---

## Self-Review (preenchido pelo autor do plano)

**1. Cobertura da spec:**
- §4 Arquitetura → Tasks 1–9 criam `Color`, `Theme`, `Ring`, `AsteroidBelt`, `Comet` e refatoram `Planet`/`SolarSystemSvg`. ✓
- §5 Motor de paleta → Task 2. ✓
- §6 Técnica flat (planeta/terminador/atmosfera/sombra, sol, fundo) → Tasks 3, 5, 6. ✓
- §7 Novos elementos (anéis, cinturão, cometas) → Tasks 4, 7, 8. ✓
- §8 Composição/z-order/animação → Task 9 (+ animações: órbitas T3, drift T7, cometas T8). ✓
- §9 Performance (symbol/use, contagem, meta peso) → Task 6 + orçamento verificado em T6/T9. ✓
- §10 Erros (defaults, sem undefined index) → harness converte avisos em falha (T1) + índices com wrap (`planet($i)`). ✓
- §11 Testes/verificação (todos temas, bem-formação, xmllint, visual) → Task 9. ✓

**2. Placeholders:** nenhum "TBD/TODO"; todo passo de código traz o código.

**3. Consistência de tipos:** assinaturas de `Color`/`Theme`/`Ring`/`AsteroidBelt`/`Comet` idênticas entre a seção Interfaces e cada task; `Planet` novo construtor `(...,Theme $theme,int $index)` usado igual em `SolarSystemSvg::addPlanet`.

**Nota de escopo:** plano único e coeso (um subsistema visual). Ordem das tasks garante app sempre renderizável entre commits.
