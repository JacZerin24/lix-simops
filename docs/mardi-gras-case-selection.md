# Mardi Gras historical case selection

## Exercise target

The first full LIX SimOps exercise is framed as **Krewe of Endymion parade
operations on February 6, 2027**, with the parade scheduled to begin at
4:00 PM local time.

The simulator can map a historical LIX case onto the 2027 exercise date and
apply a facilitator-only local-time offset. This keeps the meteorology
spatially authentic while preventing the source date/time from giving away
the case.

## Selected case — May 12, 2021

The selected hidden source case is the **May 12, 2021 New Orleans EF0
tornado**.

Why it was selected:

- the severe-weather threat was not an obvious high-end cancellation signal
  the day before
- the convective line evolved quickly as it reached the New Orleans metro
- the tornado directly affected New Orleans, including Uptown/CBD/Algiers
- KLIX Level II, GOES-16 ABI, GLM, MRMS, RAP, and surface observations are
  available from the modern satellite/lightning era
- the event creates a useful displaced-real-time problem: teams must detect
  a deteriorating threat and communicate a consequential recommendation
  rather than simply act on an obvious high-end outlook

Historical anchor:

- tornado start: **2:05 AM CDT**
- tornado end: **2:12 AM CDT**
- rating: **EF0**
- estimated peak wind: **85 mph**
- path length: about **5.26 miles**

Facilitator references:

- https://ready.nola.gov/incident/may-12-tornado/
- https://nola.gov/next/mayors-office/news/articles/2021/may-2021/city-of-new-orleans-responds-to-possible-overnight-tornado/

## Why December 14, 2022 was replaced

The December 14, 2022 metro tornado case aligned naturally with a 4 PM
Endymion start, but the event carried a **Day-2 Enhanced Risk**. That weakens
the exercise premise because a large outdoor parade could plausibly have
been cancelled or substantially altered before the DRT begins.

The May 2021 case better supports the intended training question: **what do
teams do when the threat becomes materially worse during operations?**

## Time mapping

The May 2021 source window is **06:00–07:45 UTC**, corresponding to
**1:00–2:45 AM CDT**.

The simulator applies a facilitator-only **+825 minute (13 h 45 min)** local
time shift before mapping the data to February 6, 2027:

- 1:00 AM source -> 2:45 PM exercise start
- 2:05 AM source -> 3:50 PM exercise tornado onset
- 2:12 AM source -> 3:57 PM exercise tornado end
- 2:45 AM source -> 4:30 PM exercise end

Example:

```bash
python scripts/build_radar_cache.py \
  --scenario-id mardi-gras-dss-001 \
  --input data/raw/nexrad/20210512 \
  --site KLIX \
  --simulation-date 2027-02-06 \
  --timezone America/Chicago \
  --local-time-offset-minutes 825
```

Historical source filenames remain in facilitator-controlled raw storage.
Participant-facing manifests use only the mapped exercise timestamps and
omit historical source keys.
