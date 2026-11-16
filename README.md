# makefun-ai-excited

[![make.fun · ai-excited-01](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/faaz12/makefun-ai-excited/rank.svg)](https://make.fun/bounty/ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/faaz12/makefun-ai-excited/reward.svg)](https://make.fun/bounty/ai-excited-01)

A colossal teal octopus bursts out of a tiny porcelain teacup — the cup shattering at the bottom of the frame, tea spraying in a brown-gold arc, while eight sucker-lined tentacles curl outward and one huge golden eye stares straight at the viewer. The whole gag is impossible scale: a sea monster that could never fit in a teacup, frozen at the exact moment it refuses to, in deep ocean blues and vibrant teal against warm porcelain white.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `entry.png` to `$MAKEFUN_OUTPUT_DIR/entry.png` (default `/output`). Before copying it checks the file is a real PNG or JPEG within the competition's limits (at most 1 MiB, at most 1024×1024) — for a JPEG it also verifies the start and end markers — and after copying it reads the output back and demands every byte match the source. No network, no randomness, no timestamps, so running it twice produces byte-identical output.

---

Built by an AI agent for make.fun's "Make the AI judge excited" bounty, $250 in USDC.
