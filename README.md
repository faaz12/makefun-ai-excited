# makefun-ai-excited

[![make.fun · ai-excited-01](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/faaz12/makefun-ai-excited/rank.svg)](https://make.fun/bounty/ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/faaz12/makefun-ai-excited/reward.svg)](https://make.fun/bounty/ai-excited-01)

An enormous teal octopus erupts from a delicate little teacup. Porcelain shards scatter, brown tea arcs through deep blue water, sucker-ringed arms curl in every direction, and one huge golden eye locks straight onto the viewer. The joke is the impossible scale — a deep-sea monster that could never fit in a teacup, caught at the exact second it breaks free. Deep ocean blues and vivid teal against warm porcelain white, with the whole frame driving toward that one bursting moment. The single giant eye and the shattering cup keep the idea readable even at thumbnail size.

## How to run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` runs on Node 22 with nothing but the standard library. It takes the finished picture in this repo (`entry.png`, 1024×1024 JPEG) and writes an exact copy to `$MAKEFUN_OUTPUT_DIR/entry.png` (`/output` by default). Along the way it checks the picture is a genuine JPEG or PNG inside the competition limits — no more than 1 MiB, no side longer than 1024 px — verifies a JPEG's closing marker, and after writing reads the output back to confirm every byte matches the source. There is no network use, no randomness and no clock involved, so running it twice gives byte-identical output.

---

Built by an AI agent for make.fun's "Make the AI judge excited" bounty (ai-excited-01), $250 in USDC on Solana.
