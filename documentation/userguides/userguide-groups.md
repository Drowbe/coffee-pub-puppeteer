# Building and Moving Groups

**Audience:** game masters building carts, ships, drawbridges and stages.

Everything here is GM only. A group is a pin on the map plus the tiles, drawings, lights, sounds, walls, notes and regions that travel with it.

## Add and remove parts

1. Open the Group Editor with **Puppeteer Groups** in the toolbar, and find the group on the **Scene Groups** tab.
2. Select objects on the map and choose **Add Selected**. Foundry shows one layer at a time, so add one layer's objects, then switch layers and add the next. Regions are added this way too.
3. Or choose **Capture Area** and drag a box. Everything inside it, on every layer, joins the group.
4. To take parts out, select them and choose **Remove Selected**, or use the cross beside a part under **Members**.

Right-clicking the pin gives the same actions, and double-clicking the pin opens the Group Editor on that group.

## Name parts and find them again

Under **Members**, type a name beside any part, such as "Left lantern". Choose the small icon beside a part to select it on the map, and hold Shift to add to your selection. Choose a part's id to copy its UUID.

**Show group bounds** (an icon in the editor's title bar, a toolbar tool and a menubar button) draws the box around each group, its pivot and the way it faces. It is off by default and remembered for you.

## Move and turn a group

- **Move:** drag the pin.
- **Turn:** select the pin, hold Shift and scroll the mouse wheel over the board. Each notch is 5 degrees. The **Heading** field and the rotate buttons in the Group Editor do the same.

## Choose where the group turns about

- **Centre Pivot** moves the pin to the middle of the group without moving anything, so the group turns about its own centre.
- **Move Pivot** puts the pin anywhere, such as the prow of a ship, a wagon's hitch or a door's hinge. Choose **Move Pivot** on the group (the button turns blue and a notice appears) and drag the pin to where you want it. The pin moves, nothing else does, and Move Pivot switches itself off when you drop the pin. After that the group moves and turns about the new spot. Choose **Move Pivot** again before dragging to cancel.

## Edit parts by hand

Move, turn or resize any part directly on the map. The group remembers the new position and nothing snaps back on the next move.

## Delete a group

Choose **Delete** on the group. If it has parts you are asked to choose **Delete group only**, which leaves the parts on the map, or **Delete group and its parts**. Either way the pin and any body token (see [Making a group something that can be attacked](userguide-targets.md)) are removed, riders are let go where they stand, and the library is not touched.

## Keep groups up to date

The **Tools** tab has **Update all groups**, which moves every group's parts to where its pin is now. This happens by itself while a GM is connected. Use it only after a pin moved while no GM was online. **Diagnose** beside each group writes a report of where its parts should be, against where they are, to the browser console (F12).
