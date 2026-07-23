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
