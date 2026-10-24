import soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro("kokoro-v1.0.int8.onnx", "voices-v1.0.bin")
L = [
  ("n1", "bm_george", 0.82, "Something huge took your family."),
  ("m1", "af_heart", 0.86, "Don't look up."),
  ("f1", "am_michael", 0.9, "Go. Don't stop."),
  ("n2", "bm_george", 0.8, "So you run."),
  ("n3", "bm_george", 0.84, "Five guardians hold the forest."),
  ("n4", "bm_george", 0.84, "Each one waits in the dark."),
  ("n5", "bm_george", 0.8, "And then... the sky breaks."),
  ("n6", "bm_george", 0.78, "There is a third direction."),
  ("n7", "bm_george", 0.84, "Three of them hold the cage."),
  ("m2", "af_heart", 0.85, "Little light."),
  ("b1", "af_sky", 1.0, "I found you."),
  ("b2", "af_sky", 0.95, "I can look up now."),
  ("n8", "bm_george", 0.78, "And then... nothing moves."),
  ("x1", "am_onyx", 0.78, "You were never meant to leave."),
  ("m3", "af_heart", 1.0, "Get behind me!"),
  ("x2", "am_onyx", 0.78, "Then all three of you."),
  ("m4", "af_heart", 0.92, "Stay together."),
  ("x3", "am_onyx", 0.74, "I will come back."),
  ("x4", "am_onyx", 0.8, "There you are."),
  ("n9", "bm_george", 0.8, "The Third Direction."),
  # the whisper under the Fourth: the same lines, a lighter voice
  ("w1", "bf_isabella", 0.78, "You were never meant to leave."),
  ("w2", "bf_isabella", 0.78, "Then all three of you."),
  ("w3", "bf_isabella", 0.74, "I will come back."),
  ("w4", "bf_isabella", 0.8, "There you are."),
]
for name, v, sp, text in L:
    s, sr = k.create(text, voice=v, speed=sp, lang="en-us")
    sf.write(f"lines/{name}.wav", s, sr)
    print(name, round(len(s) / sr, 2))
