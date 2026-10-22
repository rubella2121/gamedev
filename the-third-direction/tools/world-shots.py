#!/usr/bin/env python3
"""
The shot list of the Pressed World concept (docs/3D-WORLD.md): it writes the JSON spec that tools/world-render.mjs renders.

  npm run gallery                                              # builds dist-gallery/world3d.html, the renderer page
  python3 tools/world-shots.py specs.json landing x archive    # names: see SHOTS below (no names = all)
  node tools/world-render.mjs specs.json out/                  # PNGs (+ depth and anchors); needs python3 with numpy and PIL for tools/world-post.py
  FINAL=1 python3 tools/world-shots.py ...                     # the landscape shots at 1920 x 1080, supersampled 2x (the default is 1280 x 720)

  landscape: landing x archive remix climb summit hearth     portrait (the game's 9:16): p-landing p-explore p-x p-archive p-remix p-chase p-hearth p-summit
  cast cards: c-x c-collector c-mash c-fox                   the master map: map

Cameras are written as positions and look-at points in the world's units (the arena's: the Blob is 1.8 tall). `ots` is an over-the-shoulder camera and `gcam` is the
game's own follow camera (13 behind, 8.6 up, docs/3D-BOSSES.md) tilted up a little so the boss fits the frame.
"""
import json, math, os, sys

def norm(v):
    l = math.sqrt(sum(a*a for a in v)) or 1
    return [a/l for a in v]

def ots(B, T, d=7.0, h=3.6, s=-2.0, look_k=0.55, ly=None):
    """over-the-shoulder camera: behind the Blob (B) as it faces the target (T), a little to the left (s<0)"""
    f = norm([T[0]-B[0], 0, T[2]-B[2]])
    r = [-f[2], 0, f[0]]
    pos = [B[0]-f[0]*d + r[0]*s, B[1]+h, B[2]-f[2]*d + r[2]*s]
    look = [B[0]+(T[0]-B[0])*look_k, (ly if ly is not None else B[1]+h*0.7+(T[1]-B[1])*look_k), B[2]+(T[2]-B[2])*look_k]
    return pos, look

BASE = dict(w=1280, h=720, depth=True,
  key={"dir":[-0.3,0.75,0.6],"intensity":3.0}, back={"dir":[0.4,0.5,-0.9],"intensity":1.6},
  fog={"density":0.0035,"color":0x120a22,"far":0x2a1a4a,"heightMix":0,"inscatter":0}, fogPatch=0.4,
  rim={"k":0.5}, amb={"sky":0x8a78c8,"ground":0x2a2048,"k":1.2},
  grade={"exposure":1.25,"bloom":0.5,"bloomThreshold":0.85},
  sky={"stars":0.014})

def shot(name, build, cam, params=None, **kw):
    d = json.loads(json.dumps(BASE))
    d.update(name=name, build=build, cam=cam)
    if params: d["params"] = params
    d.update(kw)
    if os.environ.get('FINAL'):
        d['w'] = 1920; d['h'] = 1080; d['ss'] = 2
    return d

SHOTS = {}

# --- the landing: the hook of the 3D part
SHOTS["landing"] = shot("landing","garden",{"pos":[0,3.4,92],"look":[0,40,-62],"fov":80},
  {"bx":0.4,"bz":84,"bridge":1,"arc":1.1,"drift":90,"turn":0},
  shadow={"center":[0,0,20],"size":110}, key={"dir":[-0.2,0.5,0.8],"intensity":2.8},
  post={"rays":{"k":0.3,"spread":0.7},"dof":{"focus":12,"aperture":0.25,"max":3,"far":0.08},"glow":0.3}, grade={"exposure":1.5,"bloom":0.5,"bloomThreshold":0.8})
# --- X: the fight camera
B=[0.8,0.3,12.5]; T=[0,12,-29]; pos,look=ots(B,T,d=8.8,h=4.6,s=-2.6,look_k=0.6,ly=6.8)
SHOTS["x"] = shot("x","garden",{"pos":pos,"look":look,"fov":66},{"foot":0.5,"bx":B[0],"bz":B[2],"arc":0.9},
  shadow={"center":[0,0,-4],"size":50}, key={"dir":[-0.35,0.8,0.5],"intensity":2.6},
  post={"rays":{"k":0.3,"spread":0.6},"dof":{"focus":8,"aperture":0.4,"max":5,"far":0.2},"glow":0.3})
# --- the Collector's hall
A=[64,46,-18]; B=[A[0]-1.5,A[1]+0.3,A[2]+3]; T=[A[0],A[1]+10,A[2]-29]; pos,look=ots(B,T,d=8.0,h=4.4,s=-2.2,look_k=0.7,ly=A[1]+9.5)
SHOTS["archive"] = shot("archive","archive",{"pos":[60.2,51.2,-5.0],"look":[63.2,52.2,-40],"fov":64},{"poses":"minions:1,pins:1,drawer:1","arc":0.9,"bx":-1.5,"bz":3},
  shadow={"center":[A[0],A[1],A[2]-6],"size":50}, key={"dir":[-0.3,0.7,0.6],"color":0xffd8a8,"intensity":2.2}, back={"dir":[0.4,0.5,-0.9],"color":0xff9a40,"intensity":1.4},
  amb={"sky":0xa08878,"ground":0x3a2418,"k":1.1},
  post={"rays":{"k":0.3,"spread":0.6},"dof":{"focus":8,"aperture":0.4,"max":5,"far":0.2},"glow":0.35})
# --- the Mash's wing
R=[-64,92,-30]; B=[R[0]+2.5,R[1]+0.3,R[2]+10]; T=[R[0],R[1]+10,R[2]-26]; pos,look=ots(B,T,d=7.0,h=3.9,s=-2.4,look_k=0.6,ly=R[1]+9)
SHOTS["remix"] = shot("remix","remix",{"pos":pos,"look":look,"fov":62},{"poses":"toll:1,bloom:1","arc":0.9,"bx":2.5,"bz":10},
  shadow={"center":[R[0],R[1],R[2]-6],"size":50}, key={"dir":[-0.3,0.7,0.6],"color":0xa0f0ff,"intensity":2.4}, back={"dir":[0.4,0.5,-0.9],"color":0xff7aa8,"intensity":1.8},
  post={"rays":{"k":0.3,"spread":0.6},"dof":{"focus":8,"aperture":0.4,"max":5,"far":0.2},"glow":0.35})
# --- the climb
SHOTS["climb"] = shot("climb","climb",{"pos":[-7.0,76.0,-24.0],"look":[16,63.5,-24],"fov":58},{"bx":0,"bz":-24.9,"by":69.3,"fx":9.0,"fy":-4.4,"fz":1.9,"fpitch":0.42,"arc":1.9,"dim":0.28,"drift":120,"turn":0,"lk":1.2,"gk":0.3,"fglow":0.1},
  shadow={"center":[0,70,-30],"size":120},
  post={"rays":{"k":0.3,"spread":0.6},"dof":{"focus":12,"aperture":0.3,"max":4,"far":0.25},"glow":0.3})
# --- the summit
SHOTS["summit"] = shot("summit","summit",{"pos":[-2.0,172.0,-92.0],"look":[0.2,185.4,-132],"fov":76},{"ax":0.4,"ay":167.4,"az":-110.8,"arc":0.8,"drift":50},
  shadow={"center":[0,170,-100],"size":80}, key={"dir":[-0.2,0.6,0.8],"color":0xffe6b0,"intensity":2.4},
  post={"rays":{"k":0.3,"spread":0.6},"dof":{"focus":14,"aperture":0.3,"max":4,"far":0.25},"glow":0.4})
# --- the hearth
SHOTS["hearth"] = shot("hearth","hearth",{"pos":[3.0,4.2,28],"look":[-1.5,3.2,8],"fov":54},{"arc":0.9,"fx":-10.5,"fz":9,"fry":0.9},
  shadow={"center":[0,0,10],"size":40}, key={"dir":[-0.3,0.7,0.6],"intensity":1.6}, back={"dir":[0.4,0.5,-0.9],"intensity":1.2},
  amb={"sky":0x6a5aa8,"ground":0x2a2048,"k":0.9}, grade={"exposure":1.15,"bloom":0.55,"bloomThreshold":0.8},
  post={"dof":{"focus":10,"aperture":0.4,"max":5,"far":0.25},"glow":0.4})

# ---------------------------------------------------------------- portrait: what the player sees (the game is 9:16)
def gcam(P, F, back=13.0, up=8.6, pitch=-8.0, fov=64):
    """the game's follow camera (13 behind, 8.6 up; docs/3D-BOSSES.md), a little less steep so the boss fits in the frame"""
    f = norm([F[0], 0, F[2]])
    pos = [P[0]-f[0]*back, P[1]+up, P[2]-f[2]*back]
    t = math.tan(math.radians(pitch))*50
    return {"pos": pos, "look": [pos[0]+f[0]*50, pos[1]+t, pos[2]+f[2]*50], "fov": fov}

def pshot(name, build, cam, params=None, **kw):
    d = shot(name, build, cam, params, **kw)
    d['w'] = 648; d['h'] = 1152; d['ss'] = 2
    return d

PBASE_POST = {"rays":{"k":0.3,"spread":0.6},"dof":{"focus":14,"aperture":0.3,"max":3,"far":0.15},"glow":0.3}
A0=[64,46,-18]; R0=[-64,92,-30]
PS = {}
PS["p-landing"] = pshot("p-landing","garden",gcam([0.2,0.3,38],[0,0,-1],pitch=-6),{"bx":0.2,"bz":38,"bridge":1,"arc":1.1,"drift":80},
  shadow={"center":[0,0,20],"size":110}, key={"dir":[-0.2,0.5,0.8],"intensity":2.8}, post=PBASE_POST, grade={"exposure":1.5,"bloom":0.5,"bloomThreshold":0.8})
PS["p-explore"] = pshot("p-explore","garden",gcam([8.0,0.3,6.0],[0.74,0,-0.67],pitch=-12),{"bx":8.0,"bz":6.0,"turn":-1.058,"arc":1.6,"drift":50,"routes":1},
  shadow={"center":[8,0,0],"size":50}, key={"dir":[-0.35,0.8,0.5],"intensity":2.6}, post=PBASE_POST)
PS["p-x"] = pshot("p-x","garden",gcam([0.8,0.3,8],[0,0,-1],pitch=-8),{"foot":0,"poses":"arms:1","bx":0.8,"bz":8,"arc":0.9},
  shadow={"center":[0,0,-4],"size":50}, key={"dir":[-0.35,0.8,0.5],"intensity":2.6}, post=PBASE_POST)
PS["p-archive"] = pshot("p-archive","archive",gcam([A0[0]-1.5,A0[1]+0.3,A0[2]+3],[0,0,-1],pitch=-8),{"poses":"minions:1,pins:1,drawer:1","arc":0.9,"bx":-1.5,"bz":3},
  shadow={"center":[A0[0],A0[1],A0[2]-6],"size":50}, key={"dir":[-0.3,0.7,0.6],"color":0xffd8a8,"intensity":2.2}, back={"dir":[0.4,0.5,-0.9],"color":0xff9a40,"intensity":1.4},
  amb={"sky":0xa08878,"ground":0x3a2418,"k":1.1}, post=PBASE_POST)
PS["p-remix"] = pshot("p-remix","remix",gcam([R0[0]-1,R0[1]+0.3,R0[2]+3],[0,0,-1],pitch=-8),{"poses":"toll:1,bloom:1","arc":0.9,"bx":-1,"bz":3},
  shadow={"center":[R0[0],R0[1],R0[2]-6],"size":50}, key={"dir":[-0.3,0.7,0.6],"color":0xa0f0ff,"intensity":2.4}, back={"dir":[0.4,0.5,-0.9],"color":0xff7aa8,"intensity":1.8}, post=PBASE_POST)
PS["p-chase"] = pshot("p-chase","climb",{"pos":[-7.0,76.0,-24.0],"look":[16,63.5,-24],"fov":64},{"bx":0,"bz":-24.9,"by":69.3,"fx":9.0,"fy":-4.4,"fz":1.9,"fpitch":0.42,"arc":1.9,"dim":0.28,"drift":120,"turn":0,"lk":1.2,"gk":0.3,"fglow":0.1},
  shadow={"center":[0,70,-30],"size":120}, post={"rays":{"k":0.3,"spread":0.6},"dof":{"focus":10,"aperture":0.3,"max":4,"far":0.25},"glow":0.3})
PS["p-hearth"] = pshot("p-hearth","hearth",{"pos":[13.5,7.5,27.0],"look":[-6,3.0,5],"fov":64},{"arc":0.9,"fx":-10.5,"fz":9,"fry":0.9},
  shadow={"center":[0,0,10],"size":40}, key={"dir":[-0.3,0.7,0.6],"intensity":1.6}, back={"dir":[0.4,0.5,-0.9],"intensity":1.2},
  amb={"sky":0x6a5aa8,"ground":0x2a2048,"k":0.9}, grade={"exposure":1.15,"bloom":0.55,"bloomThreshold":0.8}, post={"dof":{"focus":15,"aperture":0.3,"max":4,"far":0.25},"glow":0.4})
PS["p-summit"] = pshot("p-summit","summit",{"pos":[2.0,170.0,-88.0],"look":[-12,188,-128],"fov":66},{"ax":-4.0,"ay":168.1,"az":-113.5,"turn":1.18,"arc":0.8,"drift":40},
  shadow={"center":[0,170,-100],"size":80}, key={"dir":[-0.2,0.6,0.8],"color":0xffe6b0,"intensity":2.4}, post={"rays":{"k":0.3,"spread":0.6},"dof":{"focus":22,"aperture":0.3,"max":4,"far":0.25},"glow":0.4})
SHOTS.update(PS)

# ---------------------------------------------------------------- the cast, untouched (portrait cards)
def cshot(name, boss, pos, look, fov, poses="", **kw):
    opts = dict(shadow={"center":[0,10,0],"size":60}, key={"dir":[-0.4,0.6,0.7],"intensity":2.6}, back={"dir":[0.5,0.5,-0.8],"intensity":1.8},
      post={"rays":{"k":0.25,"spread":0.5},"dof":{"focus":40,"aperture":0.1,"max":2,"far":0.1},"glow":0.3})
    opts.update(kw)
    d = shot(name, "portrait", {"pos": pos, "look": look, "fov": fov}, {"boss": boss, "poses": poses, "steps": 8}, **opts)
    d['w'] = 720; d['h'] = 900; d['ss'] = 2
    return d
CS = {}
CS["c-x"] = cshot("c-x","x",[11,8.2,31],[0,7.0,0],42,"armor:1,jaw:0.3")
CS["c-collector"] = cshot("c-collector","collector",[11.5,10.2,37],[0,9.4,0],44,"drawer:1",key={"dir":[-0.4,0.6,0.7],"color":0xffd8a8,"intensity":2.4})
CS["c-mash"] = cshot("c-mash","mash",[15,10.2,43],[0,9.2,0],44,"bloom:1")
CS["c-fox"] = cshot("c-fox","fox",[6.0,2.4,8.5],[0.3,1.9,0],36,"preset:7",key={"dir":[-0.4,0.6,0.7],"intensity":2.4})
SHOTS.update(CS)

# ---------------------------------------------------------------- the master map: a tall cutaway of the whole wall (1500 x 2400, portrait)
def mapshot():
    d = shot("map", "map", {"pos":[0,360,610],"look":[0,62,-36],"fov":33}, {"arc":1.25,"dim":0.22},
      key={"dir":[-0.3,0.75,0.6],"intensity":3.2}, back={"dir":[0.4,0.5,-0.9],"intensity":1.6},
      fog={"density":0.0009,"color":0x120a22,"far":0x2a1a4a,"heightMix":0.6,"baseY":-60,"heightK":0.012}, fogPatch=0.5,
      shadow={"center":[0,90,-20],"size":260}, amb={"sky":0x8a78c8,"ground":0x2a2048,"k":1.3},
      grade={"exposure":1.3,"bloom":0.55,"bloomThreshold":0.85})
    d['w'] = 1500; d['h'] = 2400; d['depth'] = False
    d.pop('ss', None)
    return d
SHOTS["map"] = mapshot()

if __name__ == "__main__":
    names = sys.argv[2:] or list(SHOTS)
    out = {"init":{"cast":["x","collector","mash","fox"]}, "shots":[SHOTS[n] for n in names]}
    json.dump(out, open(sys.argv[1], "w"), indent=1)
    print("wrote", sys.argv[1], names)
