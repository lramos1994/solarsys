<?php
namespace SolarSystemSvg;

class Planet
{
    public $id;
    public $size;
    public $distance;
    public $moon = false;
    public $system;
    
    public function __construct($size, $distance, $moon, $system)
    {   
        $this->size = $size;
        $this->distance = $distance;
        $this->moon = $moon;
        $this->system = $system;
        $this->id = uniqid(rand(), true);

    }

    public function getOrbit()
    {
        $distance = $this->distance;
        $half_distance = $distance/2;

        $first_curve    = "M ".$this->system->getCoordinateFromCenter($distance, 0, '-')." 
                            C ".$this->system->getCoordinateFromCenter($distance, $half_distance, '-').", 
                            ".$this->system->getCoordinateFromCenter($half_distance, $distance, '-').", 
                            ".$this->system->getCoordinateFromCenter(0, $distance, '-');

        $second_curve   = "S ".$this->system->getCoordinateFromCenter($distance, -$half_distance, '+').", 
                            ".$this->system->getCoordinateFromCenter($distance, 0, '+');

        $third_curve    = "S ".$this->system->getCoordinateFromCenter($half_distance, $distance, '+').", 
                            ".$this->system->getCoordinateFromCenter(0, $distance, '+');
        
        $fourth_curve    = "S ".$this->system->getCoordinateFromCenter($distance, -$half_distance, '-').", 
                            ".$this->system->getCoordinateFromCenter($distance, 0, '-');

        $orbit = "$first_curve $second_curve $third_curve $fourth_curve";

        $observable_points = "
            <circle 
                cx='{$this->system->getEspecificCoordinateFromCenter($distance, 0, '-', 'x')}' 
                cy='{$this->system->getEspecificCoordinateFromCenter($distance, 0, '-', 'y')}' 
                r='3' fill='#000'></circle>

            <circle 
                cx='{$this->system->getEspecificCoordinateFromCenter($distance, $half_distance, '-', 'x')}' 
                cy='{$this->system->getEspecificCoordinateFromCenter($distance, $half_distance, '-', 'y')}' 
                r='3' fill='#eee'></circle>
            
            <circle 
                cx='{$this->system->getEspecificCoordinateFromCenter($half_distance, $distance, '-', 'x')}' 
                cy='{$this->system->getEspecificCoordinateFromCenter($half_distance, $distance, '-', 'y')}' 
                r='3' fill='#eee'></circle>

            <circle 
                cx='{$this->system->getEspecificCoordinateFromCenter(0, $distance, '-', 'x')}' 
                cy='{$this->system->getEspecificCoordinateFromCenter(0, $distance, '-', 'y')}' 
                r='3' fill='#eee'></circle>
        ";

        return $observable_points."<path fill='none' stroke-width='0.1' stroke='lightgrey' id='orbit-$this->id' d='$orbit' />";
    }

    public function getPlanet()
    {
     
        $size = $this->size;
        $half_size = $size/2;
        $double_size = $size*2;
        $third_size = $size+($size/2);
        
        $first_curve = "M 0 $size C 0 $half_size, $half_size 0, $size 0";
        $second_curve = "S $double_size $half_size, $double_size $size";
        $third_curve = "S $third_size  $double_size, $size $double_size";
        $fourth_curve = "S 0 $third_size, 0 $size";
        $planet_path = "$first_curve $second_curve $third_curve $fourth_curve";

        $moon = '';

        if($this->moon) {
            $moon_size = $this->size/2;            
            $negative_margin = ($moon_size/2) + $this->size;

            $moon = "
            <path transform='translate(-".($this->size)." -".($this->size).")' fill='none' stroke-width='0.5' stroke='lightgrey' d='$planet_path' id='planet-$this->id'></path>
            <g>
                <circle transform='translate(-".($this->size)." -".($this->size).")' cx='0' cy='0' r='".$moon_size."' fill='red'></circle>
                <animateMotion keyPoints='1;0' keyTimes='0;1' dur='7s' repeatCount='indefinite'>
                    <mpath xlink:href='#planet-$this->id' />
                </animateMotion>
            </g>";
        }

        return "<g>
            <circle transform='translate(-".($size/2)." -".($size/2).")' cx='".($size/2)."' cy='".($size/2)."' r='".$size."' fill='purple'></circle>
            $moon
            <animateMotion dur='".$this->randTimes()."' repeatCount='indefinite'>
                <mpath xlink:href='#orbit-$this->id' />
            </animateMotion>
        </g>";
    }

    public function randTimes()
    {
        return rand(4, 15).'s';
    }
}
