"""Score for the Lenovo AI rack teardown: a cool bed (Dm9, 96 bpm) the whole way, a low thud as each stage lands, a
quiet click on every press of the operator's pointer and a soft air under each camera move.

    python run_sfx.py sims/lenovo-shared/score.py

Times mirror lenovo-shared/film.js (SCRIPT, STEP).
"""

import os

from sfx.score_kit import airy, bed, chords, hz, thud
from sfx.synth import click

TIMELINE = "../lenovo-film/timeline.json"
OUT = os.path.join(os.environ.get("TEARDOWN_OUT", "teardown-out"), "lenovo-score.wav")
TARGET_LUFS = -14.0
SEED = 17

CHORDS = chords("Dm9:D2 A2 C3 E3 F3/D1", "Bbmaj7:Bb2 D3 F3 A3/Bb1", "Fmaj7:F2 C3 E3 A3/F1", "C6:C3 E3 G3 A3/C2")
MOTIF = [(0.5, hz("A4")), (1.5, hz("F4")), (2.5, hz("E4"))]
STAGES = (2.6, 5.6, 8.6, 11.6, 15.0, 22.4)
CLICKS = STAGES + (18.4, 25.6, 29.0, 32.0, 33.0)
STEP = 2.1


def score(mix, tl):
    dur = tl["duration"]
    left, right, low, drums = bed(dur, 96, CHORDS, MOTIF, motif_voice="epiano", kicks=(0, 2.5), snares=(), hats=8, swing=0.0, keys_vel=0.7, keys_lp=3400)
    mix.put_stereo(0, left, right, 0.12)
    mix.put(0, low, 0.12)
    mix.put(0, drums, 0.04)
    for t in CLICKS:
        mix.put(t, click(2400, 0.025), 0.055)
    for t in STAGES:
        mix.put(t, airy(STEP, 500, 1500, 0.6), 0.02)
        mix.put(t + STEP * 0.8, thud(58, 0.06, 0.35), 0.05)
    # the reassembly: one long air and the cabinet closing
    mix.put(33.0, airy(3.6, 400, 1800, 0.6), 0.03)
    mix.put(36.4, thud(52, 0.08, 0.4), 0.07)
