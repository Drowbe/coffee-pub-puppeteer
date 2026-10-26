# Verification Owed in Foundry

**Audience:** the author, running a world.

Everything below has shipped and has not been proven in a running world. The automated suite (`node --test tests/*.test.mjs`) covers the logic under a stand-in for Foundry; none of it has seen a real canvas, a second client or a player.

**Proven in Foundry by the author:** pin groups moving and turning by dragging the pin; Centre Pivot; hand edits being kept; member names; the bounds overlay; the Group Editor window and its group controls; regions as members; the body token following a pin drag after the options fix; boarding a token by dropping an actor on the group and by Board Selected.

**Not proven:** everything listed here. Delete an item once it passes. Delete this file when it is empty.

## Group cards, hiding and the library editor

- [ ] With the Blacksmith that has tool-themed toggles and badges (in its working tree, not yet released), the toggle labels, the off sliders and the badges are readable on the Light theme, and still right on Dark and Glass.
- [ ] With the Blacksmith that has the tool-window controls (working tree, not yet released): every button in the editor is the shared 24px button, the icon-only ones are square with a tooltip, Delete, Remove and Clear turn red on hover, Hide, Show and Move Pivot show the orange selected state, and the footer New Group and Import are the compact themed footer buttons.
- [ ] Each group is a Blacksmith card: the caret turns when it opens, clicking the title line or the caret opens and closes it, pressing Go To Pin, Hide or Delete never opens or closes it, and an open card stays open when the editor redraws. The group's name is text with a pencil in the card's title: the pencil turns it into a field with the text selected, Enter, Tab or clicking away saves it, Escape puts it back and returns focus to the pencil, an empty group or entry name is refused, and neither opens or closes the card. The same pencil works on a part's name and on a library entry's name and description, and a scene change while typing does not take the field away.
- [ ] Clicking anywhere on a part's row selects it on the map (a wall or a light is easy to pick out), Shift adds, the map pans to an off-screen part, and the pencil, eye and remove buttons still do their own job. The same for a rider's row. There is clear space between the controls in each section.
- [ ] Sections inside an open card have a rule above each one and a small caption, and hints and empty states read on the Light theme.
- [ ] The on/off options (Turns with its pin, Announce boarding, Riders move freely; Tokens board; Linked) are segments of the segmented control with a checkbox each: each fills orange when on, clicking one changes only that option, and they stay compact on one line.
- [ ] Moves by is a segmented control: Gliding or Jumping, the chosen one filled orange, arrow keys move it, and choosing one saves it and enables or disables the milliseconds field.
- [ ] The tab bar is underline tabs with a count pill that lines up with its label, the open tab has an orange underline, and the inactive tabs are readable. The four select-by-type buttons under Parts are one joined row.
- [ ] The editor looks right in the Light, Dark and Glass themes: the tabs, the list rows and the badges are Blacksmith's own, there is 8px of padding round the body, and nothing is a stray dark panel on the Light theme.
- [ ] A closed card shows name, parts, heading, Go To Pin, Hide and delete on one line at the default window width, and again at a narrow one. Opening and closing a card works, and an open card stays open while you drag a pin.
- [ ] The editor's scroll position does not jump when a group moves while you are scrolled down.
- [ ] Hide hides a tile, a light, a sound and a region, leaves a wall and a note, and Show restores them. A part hidden before the group was hidden stays hidden. The eye on a part works.
- [ ] A hidden group still follows its pin, and a player cannot see its hidden parts.
- [ ] Rename and describe a library entry, then Update from group, and check copies already placed are unchanged. Fabricate works.

## Move Pivot

- [ ] Choose Move Pivot on a group with a rider and a body. Drag the pin to the prow. Nothing else moves, and the button and notice switch off by themselves when the pin is dropped.
- [ ] Drag the pin again and the whole group follows. Turn it with Shift and the wheel and the group turns about the new grip.
- [ ] Choose Move Pivot, then choose it again before dragging: it cancels.

## Behaviour

- [ ] Moves by Gliding: the group glides on a pin drop and follows the pointer during a drag. With 1000 ms it takes visibly longer.
- [ ] Moves by Jumping: no movement between the two places and nothing follows a drag.
- [ ] Riders glide along with the group, and a turn swings them on an arc.
- [ ] Turns when its pin turns, switched off: turning the pin turns nothing, the heading field and rotate buttons are disabled, moving the pin still carries the group. Switch it back on and nothing swings.
- [ ] Riders can move about, switched off: a rider moved by hand goes straight back.
- [ ] Announce boarding in chat: a public card and a soft sound for everyone when a token boards, and when it leaves.

## Riders

- [ ] With Tokens board when they move onto it turned on, a player drags their own token onto the group and it boards. A player drags it off and it dismounts, with a toast.
- [ ] A rider walked about inside the group stays where it was put through the next move.
- [ ] Dismount stays off while the token is still on the group, and boards again after it has left and come back.
- [ ] Deleting the group lets its riders go where they are.

## Body token

- [ ] Drag an actor onto a group's body row, use Use Selected Token, turn Linked on and off, and use the cross to remove it.
- [ ] The body follows a drag, a turn, and added or removed parts.
- [ ] A truly transparent token draws no shadow or border.
- [ ] A tile or light under the footprint can still be clicked.
- [ ] A teleport move of the body does not count against combat movement.

## Library

- [ ] Save, Stamp, Import and Export. A stamp of a group that has a body, once turned, has its own body for that stamp.
- [ ] A stamp in a world without that actor has no body and a toast says so.

## Other

- [ ] A world that has a group saved with a token anchor (an earlier build) opens with it as a pin group where the token was, nothing moved, the token unchanged, and one toast.
- [ ] Duplicate a scene that has groups, riders and a body. Move a group on each scene: both work and neither disturbs the other.
- [ ] Undo (Ctrl+Z) of a rider's move, and a rider whose move is paused or stopped partway, leave it where Foundry committed it.
- [ ] Capture Area, the pin menu, double-clicking a pin, the Group Editor tabs and delete flows, and the menubar: one Puppeteer button in the middle zone beside the other Coffee Pub tools, nothing of Puppeteer in the left zone, the button opens a bar below with Group Editor, New Group, Update All Groups and Group Bounds, the button stays lit while the bar is open, and Group Bounds lights while the overlay is on.
- [ ] Every Puppeteer toast can be switched off with the Puppeteer channel in Blacksmith's notification settings.

## User guides

- [ ] Walk each guide in `documentation/userguides/` in a running world, as a GM and then as a player. The player guide is the most likely to be wrong, because its claims about what a player sees come from reading the code.
