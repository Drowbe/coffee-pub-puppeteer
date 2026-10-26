# Choosing How a Group Behaves

**Audience:** game masters tuning how a group moves.

Everything here is GM only. Each group has a **Behaviour** section in the Group Editor, on its row under **Scene Groups**.

## Make it glide or jump

**Moves by** chooses what players see when a pin moves or turns.

- **Gliding** eases the group, and any riders, to the new place, and the group follows the pointer while you drag the pin. Set how long it takes in milliseconds, from 100 to 3000. The default is 350.
- **Jumping** shows no movement between the two places.

Lights, walls, sounds and regions always jump, because Foundry works out sight and sound from where they are saved, so they cannot be drawn part way. A cart with a lantern on it shows the lantern snap to its new place at the end of each move.

## Stop it turning

**Turns with its pin** is on by default. Turn it off for a group that should slide about without ever turning, such as a platform on rails. The group keeps the way it faces now, the pin can be turned freely, and the **Heading** field and rotate buttons are disabled. Turning it on again records the group against the pin's own heading first, so nothing swings round.

## Keep riders in place

**Riders move freely** is on by default. Turn it off and a rider moved by hand is put straight back where it rides.

## Announce boarding

**Announce boarding** posts a public card and plays a soft sound for everyone when a token boards or leaves. It is off by default.

## Other controls that live beside it

- **Tokens board when they move onto it** is on the group's riders row (see [Carrying tokens as riders](userguide-riders.md)).
- The **Group Bounds** button on the Puppeteer bar (see [Getting started](userguide-getting-started.md)) lights up while the bounds are shown.
- Puppeteer's messages come on their own channel. A GM can switch them off in Blacksmith's notification settings.
