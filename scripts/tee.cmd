@if (@X)==(@Y) @end /* Harmless hybrid line that begins a JScript comment

::--- Batch section within JScript comment that calls the internal JScript ----
@echo off
cscript //E:JScript //nologo "%~f0" %*
exit /b

----- End of JScript comment, beginning of normal JScript  ------------------*/
var fso = new ActiveXObject("Scripting.FileSystemObject");
var mode=2;
if (WScript.Arguments.Count()==2) {mode=8;}
var out = fso.OpenTextFile(WScript.Arguments(0),mode,true);
var chr;
while( !WScript.StdIn.AtEndOfStream ) {
  chr=WScript.StdIn.Read(1);
  WScript.StdOut.Write(chr);
  out.Write(chr);
}
/* https://stackoverflow.com/a/10719322/3624264 */