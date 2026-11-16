# Hávamál

A quiet memorization app for one reader, mostly on a phone. It is a static site: Old Norse, Henry Adams Bellows’s English, and Erik Brate’s Swedish, plus a private translation you can keep on the device. There is no account and no server.

The public address, once GitHub Pages is turned on for this repository, is [https://brokkssmidja.github.io/havamal/](https://brokkssmidja.github.io/havamal/).

## Pages

In the repository settings, set Pages to **GitHub Actions** (`build_type: workflow`). The workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) checks the texts, uploads the `site/` directory, and deploys it. It runs when `main` is updated.

On the phone, open the site in Chrome, then **Add to Home screen**. The manifest and service worker install it as an offline app. The first visit needs a network so the stanzas can be cached. After that the reading, practice, and saved progress work with the radio off.

## The three texts

All three are public domain. No stanza was paraphrased. Where a printed line is lost, the dots are the edition’s dots.

**Old Norse.** Gustav Neckel, *Edda: Die Lieder des Codex Regius nebst verwandten Denkmälern*, I. Text (Heidelberg: Carl Winter, 1914), pp. 16–43. Neckel died in 1940; this edition is in the public domain. The digital text follows a stanza-by-stanza transcription that was read from the 1914 pages (the reading notes are at [hrafn-wikinger.com](https://hrafn-wikinger.com/quellen/lieder-edda/havamal/)). Neckel’s italics, which mark letters he restored, are not shown. His wording, punctuation, lacuna dots, and marks such as `†` and `*` are kept. A long line that Neckel sets with a caesura in the middle is broken into two lines here, at that caesura, so it is easier to read on a phone. The words are not rewritten.

Guðni Jónsson’s later normalization is not in this repository. He died in 1974, so that edition is not treated as public domain here. It was used only as a private check that all 164 stanza boundaries were present.

**English.** Henry Adams Bellows, *The Poetic Edda* (New York: The American-Scandinavian Foundation, 1923), “Hovamol.” Public domain (Bellows died in 1939; the 1923 book is out of copyright in the United States). Text from [Project Gutenberg ebook 73533](https://www.gutenberg.org/ebooks/73533). The `|` in that transcription is the caesura, and it is a line break here. Bellows’s introduction and notes are not included.

**Swedish.** Erik Brate, *Eddan: De nordiska guda- och hjältesångerna* (1913), “Den höges sång.” Public domain (Brate died in 1924). Electronic text from [Project Runeberg](https://runeberg.org/eddan/se-02.html), copied as digitized.

The poem face is a subset of [EB Garamond](https://github.com/octaviopardo/EBGaramond12) (SIL Open Font License; see `site/fonts/OFL.txt`).

## Stanza numbers

The app’s numbers are Neckel’s 1–164. Brate’s 1913 text uses those same numbers: stanza 138 is the hanging (“Jag vet, att jag hängde” / “Veit ek, at ek hękk”), and stanza 164 is the close in the hall. The charm-counts match as well (Neckel’s “it þriðia” is Brate’s “Den tredje,” both at 148).

Bellows printed **165** stanzas and moved or split a few. The English under a given number is the Bellows stanza with the same sense, and the caption under the English says when his printed number is different.

| App / Neckel / Brate | Bellows 1923 | What happened |
| --- | --- | --- |
| 1–38, 41–75, 81–87, 90–104, 107–137 | the same number | Same place in the poem |
| 39 | 40 | Bellows swapped these. His note says the manuscript has 39 after 40. Neckel and Brate keep “I found no one so generous” as 39. |
| 40 | 39 | Bellows’s “if wealth a man has won.” |
| 76 | 77 | The first “cattle die” stanza (a good name). Bellows put Fitjung’s sons first. |
| 77 | 78 | The second “cattle die” stanza (the judgment on the dead). |
| 78 | 76 | Fitjung’s sons, and wealth that blinks away. |
| 79 | 80 | The fool who gains wealth or a woman’s love. |
| 80 | 79 | The runes, and silence. |
| 88 | 89 | Do not trust an early field, or a son too soon. |
| 89 | 88 | A brother’s slayer, a half-burned house, a swift horse. Bellows’s note says the manuscript has 88 after 89. |
| 105 | 106 | Gunnlǫð gives the mead. |
| 106 | 105 | Rati’s mouth, the boring through the rock. |
| 138–161 | 139–162 | Bellows moved the closing stanza up to his 138, so everything from the hanging through the sixteenth song sits one number higher in his book. |
| 162 | 163 and 164 | Neckel and Brate keep the seventeenth song and the Loddfáfnir refrain in one stanza. Bellows splits them: 163 is the song (with dots for the missing lines), 164 is the refrain. |
| 163 | 165 | The eighteenth song. |
| 164 | 138 | “Now are Hor’s words spoken in the hall.” Bellows moved this up so it would close the counsel to Loddfáfnir. Neckel and Brate leave it at the end. |

Two notes on the Swedish electronic text, which is reproduced as Project Runeberg prints it:

- Stanza 65. Brate gives only the lines that survive. Neckel and Bellows also print dots for the lost opening.
- Stanza 83. The Runeberg text has “en kamp skall man mager köpa” and “hemma skall man höst göda.” The Old Norse beside it is a lean horse (`magran mar`), fattened at home (`heima hest feita`). Those two Swedish words were left as digitized, not corrected.

Themes such as “The heron of forgetfulness” are study cues for the last practice stage. They are not a translation and they are not part of any edition.

## Your own translation

Jackson Crawford’s translation is not in this repository and must not be added to it. If you own a copy, you can put it on your own phone.

In **More**, paste or upload a file. It is saved in IndexedDB on that device (or in `localStorage` under `havamal-v1:translation` if IndexedDB is blocked). It then appears as another translation, and as a language you can memorize. Removing it deletes it from the device.

JSON, either a map or a list:

```json
{
  "name": "My translation",
  "stanzas": {
    "1": "[lines of stanza 1]",
    "2": "[first line]\n[second line]"
  }
}
```

```json
[
  { "n": 1, "lines": ["[first line]", "[second line]"] },
  { "n": 2, "text": "[the stanza]" }
]
```

Or plain text. A line that is only a number from 1 to 164, or a number followed by `.` `:` or `)`, starts that stanza:

```text
1
[lines of stanza 1]

2. [first line of stanza 2]
[next line]
```

Numbers outside 1–164 are ignored. You can import as many stanzas as you have; the rest stay empty until you add them. Use the same numbers as the app (Neckel / Brate), not Bellows’s 165.

## Practice

Choose what you are memorizing: Old Norse, Bellows, Brate, or the private text. Each stanza goes through four stages:

1. The first line is visible. Recall the rest.
2. Some words are missing.
3. Only the first letter of each word is left.
4. Only the stanza number and a short theme are left.

You grade yourself: **Again**, **Hard**, **Good**, **Easy**. The schedule is the SM-2 pattern Anki uses with those four buttons. Again comes back in about ten minutes and steps back a stage. Hard waits about as long as last time, a little longer. Good moves you to the next stage (1 day, then 6 days, then the interval times the ease, which starts at 2.5). Easy waits longer and raises the ease a little. From stage 4 onward, Good and Easy stay on full recall and only the interval grows.

**Today** lists what is due and offers new stanzas up to the daily limit. The default is 2. You can set it from 0 to 5 under More. A limit of 0 means reviews only.

**Read** is the poem with the Old Norse and one translation. Tap the translation’s name to switch. Swipe, or use Prev and Next.

**Stanza of the day** is the day of the year, wrapping at 164. 1 January is stanza 1. It does not mark the stanza as learned.

## Progress

Progress and settings live in `localStorage` under the prefix `havamal-v1` (`havamal-v1:settings`, `havamal-v1:cards`). Export writes a `havamal-v1` backup file that also includes a private translation if one is stored. Import replaces what is on the device, after you confirm. Reset erases review history only, after a second confirmation, and leaves the private translation in place until you remove that separately.
