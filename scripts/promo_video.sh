#!/bin/bash
# Usage: promo_video.sh <lang: english|hinglish> <out.mp4>  — builds 1920x1080 ~30s promo from kit phone shots
set -e
LANG_DIR=$1; OUT=$2; W=$(mktemp -d); cd $W
unzip -q /app/backend/static/kit/cinereel-playstore-kit.zip "$LANG_DIR/phone/*"
F=$(python3 -c "import sys;sys.path.insert(0,'/app/backend');from video_renderer import FFMPEG_BIN;print(FFMPEG_BIN)")
python3 - <<'PY'
import numpy as np, wave
sr=44100; t=np.arange(int(sr*29.4))/sr
ch=[(220,277.2,329.6),(196,246.9,293.7),(174.6,220,261.6),(196,246.9,293.7)]
pad=np.zeros_like(t)
for k,c in enumerate(ch*4):
    m=(t>=k*1.9)&(t<(k+1)*1.9+0.3); pad[m]+=sum(np.sin(2*np.pi*f*t[m]) for f in c)/3
y=0.35*pad*(0.7+0.3*np.sin(2*np.pi*0.25*t))+0.45*np.sin(2*np.pi*55*t)*np.exp(-9*(t%0.5))+np.random.randn(len(t))*np.exp(-60*((t+0.25)%0.5))*0.15+np.sin(2*np.pi*880*t)*np.exp(-14*(t%0.25))*0.12
y*=np.minimum(1,np.minimum(t/1.0,(29.4-t)/2.0)); y=y/np.abs(y).max()*0.8
w=wave.open('music.wav','w');w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr);w.writeframes((y*32767).astype('<i2').tobytes());w.close()
PY
IN=""; FC=""; for i in 1 2 3 4 5 6 7 8; do IN="$IN -loop 1 -framerate 30 -t 4.2 -i $LANG_DIR/phone/0$i.png"; FC="$FC[$((i-1)):v]split[s$i][t$i];[s$i]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=30:3,eq=brightness=-0.25[b$i];[t$i]scale=-2:1000,zoompan=z='1+0.0006*on':d=1:s=562x1000:fps=30[f$i];[b$i][f$i]overlay=(W-w)/2:(H-h)/2:shortest=1,setsar=1,format=yuv420p,fps=30[v$i];"; done
X="[v1][v2]xfade=transition=fade:duration=0.6:offset=3.6[x2]"; o=3.6; for i in 3 4 5 6 7 8; do o=$(python3 -c "print(round($o+3.6,2))"); X="$X;[x$((i-1))][v$i]xfade=transition=slideleft:duration=0.6:offset=$o[x$i]"; done
$F -y -loglevel error $IN -i music.wav -filter_complex "${FC}${X}" -map "[x8]" -map 8:a -c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p -c:a aac -b:a 160k -shortest -movflags +faststart "$OUT"
rm -rf $W
