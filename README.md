# Coffee Pub Puppeteer

![Foundry v14](https://img.shields.io/badge/foundry-v14-green)
![MIT License](https://img.shields.io/badge/license-MIT-blue)

Move the pieces of a scene as one. Group the tiles, lights, walls, sounds, drawings, notes and regions that make up a cart, a ship or a drawbridge, then drag or turn a single pin to move and turn all of it.

## What it does

- **One pin moves everything.** Drag the pin and the whole group follows; hold Shift and scroll over the pin and the whole group turns about it. Put the pin where it belongs: the prow of a ship, a wagon's hitch, a door's hinge.
- **Smooth movement.** Tiles, drawings, notes and riders glide to their new place instead of jumping, or jump if you prefer.
- **Carry tokens.** Tokens that move onto a group ride with it, can walk about on it, and get off by walking away.
- **Make a group something that can be attacked.** Give a group an actor and the whole thing becomes one target with that actor's hit points.
- **A library of groups.** Save a group and place as many independent copies as you like, on any scene.
- **Edit by hand.** Move or turn any part directly and the group remembers it.

## Requirements

- Foundry VTT version 14.
- [Coffee Pub Blacksmith](https://github.com/Drowbe/coffee-pub-blacksmith) **14.4.1 or newer**. Puppeteer does not run without it.

## Install

In Foundry, go to **Configuration and Setup -> Add-on Modules -> Install Module** and paste:

```
https://github.com/Drowbe/coffee-pub-puppeteer/releases/latest/download/module.json
```

Do the same for Blacksmith, which Puppeteer does not run without:

```
https://github.com/Drowbe/coffee-pub-blacksmith/releases/latest/download/module.json
```

Then enable both in your world's module settings.

## Where to read more

Everything is on the [wiki](https://github.com/Drowbe/coffee-pub-puppeteer/wiki):

- **[Getting started](https://github.com/Drowbe/coffee-pub-puppeteer/wiki/userguide-getting-started)**: your first group in five minutes.
- **[Players](https://github.com/Drowbe/coffee-pub-puppeteer/wiki/userguide-player)**: what players see and can do.
- **[API](https://github.com/Drowbe/coffee-pub-puppeteer/wiki/api-puppeteer)**: calls for macros and other modules.
- **[Architecture](https://github.com/Drowbe/coffee-pub-puppeteer/wiki/architecture-groups)**: how it is built, for anyone changing it.
- **[Known issues](https://github.com/Drowbe/coffee-pub-puppeteer/wiki/known-issues)**: what does not work yet.

## The suite

| Module | What it does |
|---|---|
| [Blacksmith](https://github.com/Drowbe/coffee-pub-blacksmith) | Quality of life, gameplay frameworks, automation, and aesthetic improvements |
| [Squire](https://github.com/Drowbe/coffee-pub-squire) | A character tray: quick access to abilities, items and spells |
| [Crier](https://github.com/Drowbe/coffee-pub-crier) | Combat turn announcements with turn cards and round summaries |
| [Librarian](https://github.com/Drowbe/coffee-pub-librarian) | A campaign codex of people, places, factions and artifacts, and the quests running through them |
| [Scribe](https://github.com/Drowbe/coffee-pub-scribe) | Journal and chat card formatting for sharing narrative |
| [Bibliosoph](https://github.com/Drowbe/coffee-pub-bibliosoph) | In-game player messaging with journal-backed conversations |
| [Curator](https://github.com/Drowbe/coffee-pub-curator) | Image management: token, portrait and map image placement |
| [Minstrel](https://github.com/Drowbe/coffee-pub-minstrel) | A music, environment and one-shot manager |
| [Artificer](https://github.com/Drowbe/coffee-pub-artificer) | A crafting, recipe and blueprint system |
| [Cartographer](https://github.com/Drowbe/coffee-pub-cartographer) | Party strategic planning and sketching |
| [Herald](https://github.com/Drowbe/coffee-pub-herald) | A streaming and broadcast view with a designated cameraman user |
| [Monarch](https://github.com/Drowbe/coffee-pub-monarch) | Save and load sets of enabled modules |
| [Regent](https://github.com/Drowbe/coffee-pub-regent) | Optional AI tools and worksheets |
| [Vault](https://github.com/Drowbe/coffee-pub-vault) | Optional assets for the suite |
| [Merchant](https://github.com/Drowbe/coffee-pub-merchant) | Mark an actor as a merchant and let players browse and acquire from their stock |

<!-- global:ai-assistance -->
## AI Assistance and the Illusion of Good Code

I started writing Foundry modules for use at my own table back in 2020. There were already a ton of amazing modules out there, but they either didn't quite do what I wanted or didn't deliver the kind of user experience I was looking for.

I've been a design leader for more than 20 years, but I spent the first half of my career as a developer, so building my own modules seemed like a fun way to kill some time. I'm a pretty good designer. I'm a decent developer. But, over time, my hand-written code and hacks got a little messy (and memory-leaky, and a little buggy. Feels good to say it out loud.).

Today, the Coffee Pub suite of modules is developed with AI assistance, primarily Claude and Cursor, for documentation, refactoring, debugging, and other development work. Every change is reviewed and committed by me, and nothing reaches a release that I haven't crawled and run at my own table. I can't seem to give up my IDE. The UX design, architecture, and ideas still come from my own fever dreams and chronic lack of sleep.

Testing and verifying a change means running it in Foundry so I can watch the console, break things, fix them, and hone the experience. The repositories carry a set of tools for testing the things that are difficult to catch through review and manual testing alone. They help ensure styles don't conflict, shared coding and documentation standards stay consistent, and the suite of modules continues to work well as a system without silently breaking.

Those checks are there because AI-assisted development can move very quickly, and without oversight, engagement, and planning, it can also go confidently off the rails and deliver the illusion of good code. The AI helps me build faster. It doesn't decide what gets built, its architecture, or how it should work. You can blame this human for that.

If the idea of AI-assisted development keeps you up at night or just isn't your jam, no worries at all. I get it. You do you.
<!-- /global:ai-assistance -->

## License

MIT. See [LICENSE](LICENSE).
