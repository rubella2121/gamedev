#!/usr/bin/env bash
# The store preview videos (CrazyGames shows them when a player hovers over the cover): 16.8 s of gameplay, no text, no sound.
# Five 2D guardian fights, the cage at the Edge, then X, the Collector and the Mash in 3D. Made from the trailer's captured clips
# (../trailer-video/public/clips, see trailer-video/scripts/make.sh clips).
#   tools/brand/previews.sh   ->  brand/crazygames/preview-portrait.mp4 (1080x1920) and preview-landscape.mp4 (1920x1080)
set -euo pipefail
cd "$(dirname "$0")/../.."
CLIPS=../trailer-video/public/clips
OUT=brand/crazygames
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
# clip:start:length:look (p: the 2D pixel picture, brightened a little more; d: the 3D one)
SEGS="f-marsh:2.7:2.0:p f-thicket:6.7:2.0:p f-bones:4.0:1.6:p f-meadow:9.0:1.6:p edge:34:2.0:p x-rake:1.5:2.0:d h-x-slam:0.3:1.8:d collector-2:1.0:1.8:d mash-3:1.5:2.0:d"
i=0
: > "$WORK/list.txt"
for sg in $SEGS; do
  IFS=: read -r c t d k <<< "$sg"
  if [ "$k" = p ]; then eq="eq=brightness=0.06:contrast=1.12:saturation=1.3"; else eq="eq=brightness=0.03:contrast=1.08:saturation=1.15"; fi
  ffmpeg -v error -y -ss "$t" -t "$d" -i "$CLIPS/$c.mp4" -vf "scale=1080:1920,$eq,fps=30,setsar=1" -an -c:v libx264 -crf 18 -pix_fmt yuv420p "$WORK/s$i.mp4"
  echo "file 's$i.mp4'" >> "$WORK/list.txt"
  i=$((i + 1))
done
ffmpeg -v error -y -f concat -safe 0 -i "$WORK/list.txt" -c:v libx264 -crf 21 -preset slow -pix_fmt yuv420p -movflags +faststart -an "$OUT/preview-portrait.mp4"
# landscape: the portrait picture in the middle, over a blurred, darker copy of itself
ffmpeg -v error -y -i "$OUT/preview-portrait.mp4" -filter_complex \
  "[0]split=2[a][b];[a]scale=1920:-2,crop=1920:1080,boxblur=28:2,eq=brightness=-0.18:saturation=1.1[bg];[b]scale=-2:1080[fg];[bg][fg]overlay=(W-w)/2:0" \
  -c:v libx264 -crf 21 -preset slow -pix_fmt yuv420p -movflags +faststart -an "$OUT/preview-landscape.mp4"
echo "wrote $OUT/preview-portrait.mp4 and $OUT/preview-landscape.mp4"
