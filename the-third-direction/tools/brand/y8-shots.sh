#!/usr/bin/env bash
# Screenshots for the Y8 game page, from the game's own captures (brand/screens, 1080 x 1920) and the desktop art the Y8 build
# shows around its frame (brand/crazygames/desktop-bg.jpg):
#   brand/y8/screens/widescreen/NN.jpg  1280 x 720: the game as a desktop player sees it on Y8 (the tall frame between the art),
#                                       and two triptychs (the 2D guardians, the 3D bosses)
#   brand/y8/screens/standard/NN.jpg    760 x 570: the same desktop view, cut to 4:3
#   bash tools/brand/y8-shots.sh        (ImageMagick)
set -euo pipefail
cd "$(dirname "$0")/../.."
S=brand/screens
BG=brand/crazygames/desktop-bg.jpg
W=brand/y8/screens/widescreen
N=brand/y8/screens/standard
mkdir -p "$W" "$N"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT

# the desktop view: the game's frame (9:16, the full height) in the gap the art leaves for it
view() { # shot, width, height, out
  local w=$2 h=$3 gw
  gw=$(( (h * 9 + 8) / 16 ))
  convert "$BG" -resize "x$h" -gravity center -crop "${w}x${h}+0+0" +repage \
    \( "$S/$1.jpg" -resize "${gw}x${h}!" \) -gravity center -composite -quality 90 "$4"
}
# three shots side by side on the night sky of the art (blurred and darkened), each with a thin gold edge
trio() { # out, shot, shot, shot
  local out=$1 h=640 w=360 gap=36
  shift
  convert "$BG" -resize 1280x720^ -gravity center -extent 1280x720 -blur 0x18 -fill '#05060c' -colorize 55% "$T/bg.png"
  local x0=$(( (1280 - 3 * w - 2 * gap) / 2 )) y=$(( (720 - h) / 2 )) i=0 args=()
  for s in "$@"; do
    convert "$S/$s.jpg" -resize "${w}x${h}^" -gravity center -extent "${w}x${h}" -bordercolor '#c9a24a' -border 2 "$T/$i.png"
    args+=( "$T/$i.png" -geometry "+$(( x0 + i * (w + gap) - 2 ))+$(( y - 2 ))" -composite )
    i=$(( i + 1 ))
  done
  convert "$T/bg.png" "${args[@]}" -quality 90 "$out"
}

n=0
for s in 01-family 03-thornback-king 07-x-the-hollow 05-bone-wyrm; do
  n=$(( n + 1 )); view "$s" 1280 720 "$W/$(printf %02d $n).jpg"
done
n=$(( n + 1 )); trio "$W/$(printf %02d $n).jpg" 02-gloommother 04-toll-queen 06-mimic-queen
n=$(( n + 1 )); trio "$W/$(printf %02d $n).jpg" 07-x-the-hollow 08-collector 09-mash

n=0
for s in 01-family 03-thornback-king 04-toll-queen 07-x-the-hollow 08-collector 09-mash; do
  n=$(( n + 1 )); view "$s" 760 570 "$N/$(printf %02d $n).jpg"
done
identify "$W"/*.jpg "$N"/*.jpg | awk '{ print $1, $3 }'
