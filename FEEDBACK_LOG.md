# 1
- For the rating section, I think you can squash them down into one score: fun. Instead of "Fun, Appeal, Scope Confidence... etc." Also make it a star rating 1-5 star UI.
- Remove "Observation" and "Next move (optional)". Remove "Flag this branch for the next move" checkbox since this function is duplicated in other UI.
- the UI is kinda ugly and hard to use. We need a new redesign. How about making the node map view the main full screen view? if you click a node, it will expand into the game view while collapsing other nodes. It can be a square widget for game + short explain panel on left side + feedback panel on the right side.
- to accomodate the new UI, make the default game window a square instead rectangle for all games. You can just reduce the length of the window
- the game are currently implemented in confusing way with a lot of text. Reduce the unnecessary text.

# 2
- the game should have a minimalistic default style with grayscale +simple colors if user not specified
- Delete "3 playable branches" big text; also make the popup closable with ESC key
- Merge "Preserve" and "Change" feedback into "Feedback"; giving a star rating should auto highlight this text so you can input immediately; hitting enter from that text box should save the feedback
- hitting enter in bottom command text box next to queue button should confirm the submission
