<?php
namespace SolarSystemSvg;

class Theme
{
    private array $p;      // chosen palette
    private string $name;

    // 6 cohesive palettes; planetHues are harmonic within each theme.
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
        $base = Color::mix($this->p['planetHues'][$i % count($this->p['planetHues'])], $this->p['stars'][count($this->p['stars']) - 1], 0.5);
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
