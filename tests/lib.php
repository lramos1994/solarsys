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
