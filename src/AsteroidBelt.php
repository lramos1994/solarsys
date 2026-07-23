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
