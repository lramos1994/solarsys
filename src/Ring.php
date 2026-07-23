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
                <path d='M " . round(-$rx * 0.82, 2) . " 0 A " . round($rx * 0.82, 2) . " " . round($ry * 0.82, 2) . " 0 0 0 " . round($rx * 0.82, 2) . " 0' fill='none' stroke='{$this->t['gap']}' stroke-width='" . round($this->r * 0.18, 2) . "' opacity='0.6' />
                <path d='M " . round(-$rx * 0.66, 2) . " 0 A " . round($rx * 0.66, 2) . " " . round($ry * 0.66, 2) . " 0 0 0 " . round($rx * 0.66, 2) . " 0' fill='none' stroke='{$this->t['bands'][0]}' stroke-width='" . round($this->r * 0.28, 2) . "' opacity='1' />
            </g>
        </g>";
    }
}
