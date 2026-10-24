---
title: Example page
description: A small component and named-slot fixture.
---

::sample-card
---
enabled: true
disabled: false
count: 3
textTrue: 'true'
textFalse: 'false'
textNumber: '3'
class: bg-[linear-gradient(0deg,rgba(0,0,0,0.06),transparent)] p-6
items:
  - label: First item
    enabled: true
settings:
  nested:
    count: 2
---
#primaryLabel
Primary action

#secondaryLabel
Secondary action
::

Contact [the example team](mailto:editor@example.test).

An :badge[Status]{class="tracking-[0.06em]"} stays inline.

First line:br
Second line
