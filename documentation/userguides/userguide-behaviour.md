# Choosing How a Group Behaves

**Audience:** game masters tuning how a group moves and what happens when it does.

Everything here is GM only. Each group has a **Behaviour** section in the Group Editor, on its row under **Scene Groups**.

## Choose how it moves

**Moves by** chooses what players see when a pin moves or turns.

- **Gliding** eases the group, and any riders, to the new place over a short time, and the group follows the pointer while you drag the pin. Set how long it takes in milliseconds, from 100 to 3000. The default is 350.
- **Travelling** moves the group at a steady pace, as a token moves, so a long move takes longer than a short one. Set the pace in squares a second, from 0.5 to 60. The default is 6, which is how fast a token's own animation moves. A turn takes about a second for a half turn, and the longer of the move and the turn sets the time. The group stays where it is while you drag the pin, as a token does, and travels to the pin when you drop it.
- **Jumping** shows no movement between the two places.

Lights, walls, sounds and regions always jump, because Foundry works out sight and sound from where they are saved, so they cannot be drawn part way. A cart with a lantern on it shows the lantern snap to its new place at the end of each move.

## Stop it turning

**Faces its travel** turns a group to face the way you moved it, as a vehicle does: drag its pin east and the group turns to head east, and the pin turns with it. Tell it which end of the picture is the front with **Front of the picture**, which appears when this is on: **Down** (a token's front, the default), **Left**, **Up** or **Right**, or a number of degrees clockwise from down to fine tune. A cart drawn with its horse at the top needs **Up**; turn the group first if the picture is at an angle, then pick the nearest and adjust the number. While you drag a gliding group it turns to face the pointer, and a travelling one turns as it sets off, moving and turning together. A very short move does not turn it, and if you turn the pin yourself in the same move, your turn is the one that counts. It needs **Turns with its pin**, and is switched off while that is off.

**Turns with its pin** is on by default. Turn it off for a group that should slide about without ever turning, such as a platform on rails. The group keeps the way it faces now, the pin can be turned freely, and the **Heading** field and rotate buttons are disabled. Turning it on again records the group against the pin's own heading first, so nothing swings round.

## Keep riders in place

**Riders move freely** is on by default. Turn it off and a rider moved by hand is put straight back where it rides.

## Ignore Transparent Area

**Ignore Transparent Area** is on by default. Only the solid part of a picture counts as on the group, so a token standing on the transparent corner of a ship's picture does not board, and a rider moved onto one is let go. Turn it off and the whole box around the group counts. It makes no difference to a picture with no transparent edges, and a group with no tile in it uses the box of its drawings and regions.

## Snap to Grid

**Snap to Grid** is off by default. Turn it on and, when you drop the group's pin, the group goes to the nearest point of the grid (the centre or the corner of a square) and the pin goes there too, so the pin and the group never disagree. The point is the pin's, which is the grip of the group: put the pin at a corner of the group and the corner lands on the grid. It does nothing on a gridless scene, and while **Move Pivot** is on the pin is free to go anywhere.

## Announce boarding

**Announce boarding** posts a public card and plays a soft sound for everyone when a token boards or leaves. It is off by default.

## Make things happen

An event is a rule on a group: when this happens, do that. Open **Events** on the group's card and choose **Add Event**. A dialog asks what happens and what to do, and nothing is chosen for you: each list starts at Choose one, and the next choices appear as you make them (the choices that go with the action (a sound, a tile and a picture, a macro) appear as you pick it). If something is missing, such as no sound chosen, the dialog says so and opens again with what you typed.

| When | Fires |
|---|---|
| A token boards | Once for each token that boards, by drop, by moving onto the group, or with Board Selected. |
| A token leaves | Once for each rider that is let go, dismounted or walked off. |
| The group moves | Once each time the pin is moved or turned and the group follows it. Not for Move Pivot. |
| The group is hidden | When it goes from shown to hidden. |
| The group is shown | When it goes from hidden to shown. |
| Play is clicked | When the group's Play button is pressed. A group has a Play and Pause button only when it has an event for one of them. |
| Pause is clicked | When the group's Pause button is pressed. A group starts out playing, so its first press is Pause. |
| Its token's health becomes | When the group's token (see [Making a group something that can be attacked](userguide-targets.md)) reaches a health level: Healthy, Injured, Bloodied, Critical or Dead. Fires once when the level changes, not on every hit. |

| Do | What it does |
|---|---|
| Play a sound | Plays the sound you choose, for everyone. Use the folder button to browse. |
| Show a picture on a tile | Changes the picture of one of the group's tiles. |
| Start the animations | Starts the group's video tiles, on every screen. |
| Stop the animations | Stops the group's video tiles, on every screen. |
| Run a macro | Runs a world macro on the GM's screen. The macro is given `scope.group` (its `id` and `name`), `scope.scene` and `scope.event` (its `name`, and for boarding and leaving the `token`, for moving where it `from` and `to`). |

### Damage levels

The health levels are Blacksmith's, so a group is Bloodied at the same line as every other Coffee Pub tool, and you set those lines once in Blacksmith's settings. A scratch that Blacksmith calls Hurt counts as Healthy. A hit that takes the token past a level, from Healthy straight to Critical, runs only the events for Critical.

To make a cart that becomes a wreck: give the cart a token, then add **Its token's health becomes** Bloodied, **Show a picture on a tile**, the cart's tile and the damaged picture. Add a second event for Healthy that shows the original picture again, so healing puts it back. A group without a token has no health and never fires these.

A group can have twenty events. If an event fails, for example because its macro was deleted, the GM is told and the rest still run; the group keeps moving. A duplicate of a group has its events too, and so does a group saved to the library and fabricated from it; an event that changes the picture on a tile is pointed at the new group's own tile. A library entry saved before 14.0.0 had none of this, so save it again.

## Other controls that live beside it

- **Tokens board when they move onto it** is on the group's riders row (see [Carrying tokens as riders](userguide-riders.md)).
- The **Group Bounds** button on the Puppeteer bar (see [Getting started](userguide-getting-started.md)) lights up while the bounds are shown.
- Puppeteer's messages come on their own channel. A GM can switch them off in Blacksmith's notification settings.
