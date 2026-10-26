# Building and Moving Groups

**Audience:** game masters building carts, ships, drawbridges and stages.

Everything here is GM only. A group is a pin on the map plus the tiles, drawings, lights, sounds, walls, notes and regions that travel with it.

## Add and remove parts

1. Open the Group Editor with **Puppeteer Groups** in the toolbar. Each group on the **Scene Groups** tab is a card. A closed card is one line: its name, how many parts it has and which way it faces, with **Go To Pin**, **Hide** and delete beside them. Choose the arrow at its left to open it. Open cards stay open until you close them.
2. Select objects on the map and choose **Add Selected**. Foundry shows one layer at a time, so add one layer's objects, then switch layers and add the next. Regions are added this way too.
3. Or choose **Capture Area** and drag a box. Everything inside it, on every layer, joins the group.
4. To take parts out, select them and choose **Remove Selected**, or use the cross beside a part under **Parts**.

Right-clicking the pin gives the same actions, and double-clicking the pin opens the Group Editor on that group.

## Name parts and find them again

Under **Parts**, choose the pencil beside a part's name and type a new one, such as "Left lantern". Press Enter or click away to keep it, or Escape to put it back. A group's name is changed the same way, from the pencil in its card. Choose a part's row to select it on the map, which makes a wall or a light easy to pick out, and hold Shift to add to your selection. The map pans to it if it is off screen. Choosing a rider's row under **Riders** selects its token the same way. Choose a part's id to copy its UUID.

**Show group bounds** (an icon in the editor's title bar, a toolbar tool, and **Group Bounds** on the Puppeteer bar) draws the box around each group, its pivot and the way it faces. It is off by default and remembered for you.

## Hide and show a group

Choose **Hide** on a closed or open card to hide the group's tiles, drawings, lights, sounds, regions and body token. The button becomes **Show**, and the group's name turns italic. Walls and notes have no hidden state in Foundry, so they stay as they are, and so do any riders, because they are somebody's token. Parts that were already hidden when you hid the group stay hidden when you show it.

To hide one part, choose the eye beside it under **Parts**. Hiding the group does not stop it moving: drag the pin and the hidden parts follow.

## Move and turn a group

- **Move:** drag the pin.
- **Turn:** select the pin, hold Shift and scroll the mouse wheel over the board. Each notch is 5 degrees. The **Heading** field and the rotate buttons under **Pivot and heading** do the same.

## Choose where the group turns about

Both are under **Pivot and heading** on an open card.

- **Centre Pivot** moves the pin to the middle of the group without moving anything, so the group turns about its own centre.
- **Move Pivot** puts the pin anywhere, such as the prow of a ship, a wagon's hitch or a door's hinge. Choose **Move Pivot** on the group (the button turns blue and a notice appears) and drag the pin to where you want it. The pin moves, nothing else does, and Move Pivot switches itself off when you drop the pin. After that the group moves and turns about the new spot. Choose **Move Pivot** again before dragging to cancel.

## Edit parts by hand

Move, turn or resize any part directly on the map. The group remembers the new position and nothing snaps back on the next move.

## Delete a group

Choose **Delete** on the group. If it has parts you are asked to choose **Delete group only**, which leaves the parts on the map, or **Delete group and its parts**. Either way the pin and any body token (see [Making a group something that can be attacked](userguide-targets.md)) are removed, riders are let go where they stand, and the library is not touched.

## Keep groups up to date

The **Tools** tab has **Update all groups**, which moves every group's parts to where its pin is now. This happens by itself while a GM is connected. Use it only after a pin moved while no GM was online. **Diagnose** beside each group writes a report of where its parts should be, against where they are, to the browser console (F12).
