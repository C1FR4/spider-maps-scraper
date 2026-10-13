// banner.js
// Imprime la araña ASCII + un menú/caja centrados y armonizados,
// con colores ANSI. El arte está embebido: si lo cambias, edita SPIDER_ART.

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const BOLD_CYAN = "\x1b[1;36m";
const MAGENTA = "\x1b[35m";
const WHITE = "\x1b[97m";
const GRAY = "\x1b[90m";

const SPIDER_ART = `  
             ,,                                                     ,,
             #,..                                                #..,
                 :--                                           --:@
                 . ==+                                       +==   :
                      +*$                                 $*+
                        $$$         .         .         $$$
                         -$$        ..       ..        $$
                          # &&       *       *       &&
         ,,..              %  &       *     *       &                 ..,,
            :::-==++           BB     $ % % $     BB.          ++==-:::
                   **$$$         88  .&%%#MW&   88         $$$**
                        $$&&&     88:%%@@@@@8B 88     &&&$$
                             BBB    %%@@@%#M8B$    BBB
                                888 #%%@@@%M8&* 888
                                   WM##%@@#WB$+-
                                 88 WWMM#MW8&*=@88
                               B88  BB88:-:$+=: :88B
                            BBB   88 $  :-:  . 88   BBB
                      %@  &&&    88     :-:     88    &&&   %
                     - $$$      B8      :-:      8B      $$$ :
                     $$$       BB       :-:       BB       $$$
                  ++*$        &      %  :--  W      &        $*++
                ==          &&     %%%%%,--#MWW8     &&       %  ==
             ::--          $&    %%%%%%%%%##MMW88B    &$          --::
           ..             $$    :%%@@@@%,%%##MW88B&    $$             ..
         ,,             $$$    %%:%@@@@@@,%#,M:88B&$    $$$             ,,
                       *$     ##%%-%@@@:-@%%#MW8BB&$*     $*
                      +*    - ,##%,%@@,,-@%:,M..B&$*+      *+
                     =       #M,#.%%%,.@@@@.#MW8B&$*+        =
                   --        WMM.##.%%%@@@%#MW8B&$*+=-        --
                  :           WW:MM,#-%%%%#:.W-.&-+.-           :
                ..            88WWWMMMMM,,M,8BB:$*+=-            ..
               ,.             BB888,WWWWWW88:-$-:+=-:             .,
              ,,               &BBBBBBB:BB-&$$*.=-::               ,,
                                $&&:&&&&&$$*:,+=-:.@
                                 **,***:**++==-::.  .
                                   +++++===--::.
                                     ----:::..`;

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const visibleLength = (s) => stripAnsi(s).length;

function colorize(char) {
  if ("@%#MW8B".includes(char)) return CYAN + char + RESET;
  if ("&$*+".includes(char)) return DIM + CYAN + char + RESET;
  if ("=-:.,".includes(char)) return GRAY + char + RESET;
  return char;
}

function printSpider() {
  const art = SPIDER_ART.split("\n");
  let artWidth = 0;
  for (const line of art) {
    artWidth = Math.max(artWidth, line.length);
    let colored = "";
    for (const ch of line) colored += colorize(ch);
    console.log(colored);
  }
  return artWidth;
}

function centerLine(text, width) {
  const vis = visibleLength(text);
  const pad = Math.max(0, Math.floor((width - vis) / 2));
  return " ".repeat(pad) + text;
}

function buildBox(lines) {
  const innerWidth = Math.max(...lines.map((l) => visibleLength(l))) + 4;
  const top = MAGENTA + "┌" + "─".repeat(innerWidth - 2) + "┐" + RESET;
  const bottom = MAGENTA + "└" + "─".repeat(innerWidth - 2) + "┘" + RESET;

  const rows = [top];
  for (const line of lines) {
    const vis = visibleLength(line);
    const padTotal = innerWidth - 2 - vis;
    const padLeft = Math.floor(padTotal / 2);
    const padRight = padTotal - padLeft;
    rows.push(
      MAGENTA + "│" + RESET +
      " ".repeat(padLeft) + line + " ".repeat(padRight) +
      MAGENTA + "│" + RESET
    );
  }
  rows.push(bottom);
  return rows;
}

function printMenuBox(lines, width) {
  console.log();
  for (const row of buildBox(lines)) {
    console.log(centerLine(row, width));
  }
  console.log();
}

function printFooter(width) {
  const line = GRAY + "─".repeat(Math.min(width, 46)) + RESET;
  console.log(centerLine(line, width));
  console.log();
}

function mostrarBanner() {
  console.clear();
  const artWidth = printSpider();
  printMenuBox(
    [WHITE + BOLD_CYAN + "SPIDER MAPS SCRAPER" + RESET, "Perú · v2.1"],
    artWidth
  );
  printFooter(artWidth);
}

module.exports = { mostrarBanner };
