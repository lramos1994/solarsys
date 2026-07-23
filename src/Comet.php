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
        $tail = $this->t['tail'];
        $head = $this->t['head'];
        return "<defs>
            <linearGradient id='comet-tail-{$this->i}' x1='0' y1='0' x2='1' y2='0'>
                <stop offset='0%' stop-color='" . Color::rgba($tail, 0) . "' />
                <stop offset='60%' stop-color='" . Color::rgba($tail, 0.4) . "' />
                <stop offset='100%' stop-color='" . Color::rgba($tail, 0.9) . "' />
            </linearGradient>
            <radialGradient id='comet-head-{$this->i}'>
                <stop offset='0%' stop-color='" . Color::rgba($head, 0.95) . "' />
                <stop offset='100%' stop-color='" . Color::rgba($head, 0) . "' />
            </radialGradient>
        </defs>";
    }

    public function render(): string
    {
        // Diagonal path across the scene, off-screen to off-screen.
        $y0 = mt_rand(0, intval($this->h));
        $y1 = mt_rand(0, intval($this->h));
        $path = 'M -30 ' . $y0 . ' L ' . ($this->w + 30) . ' ' . $y1;
        $dur = mt_rand(9, 16);
        $begin = -1 * mt_rand(3, 8) * ($this->i + 1);
        $len = mt_rand(26, 40);
        $hw = round($len * 0.09, 2);   // tail half-width, proportional to length
        $hr = 2.2;                     // head core radius

        // Head at local origin; rotate='auto' aligns +x to travel, so the tail (-x) trails.
        // Smooth teardrop tail via two quadratic curves (wider near head, tapering to a point).
        $mid = round(-$len * 0.5, 2);
        $tailPath = "M 0 0 Q $mid -$hw, -$len 0 Q $mid $hw, 0 0 Z";

        return "<g>
            <path d='$tailPath' fill='url(#comet-tail-{$this->i})' />
            <circle cx='0' cy='0' r='" . round($hr * 3, 2) . "' fill='url(#comet-head-{$this->i})' />
            <circle cx='0' cy='0' r='$hr' fill='" . Color::tint($this->t['head'], 0.4) . "' />
            <animateMotion dur='{$dur}s' begin='{$begin}s' repeatCount='indefinite' rotate='auto' path='$path' />
        </g>";
    }
}
