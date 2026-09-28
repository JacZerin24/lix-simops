# Mardi Gras historical case selection

## Exercise target

The first full LIX SimOps exercise is framed as **Krewe of Endymion parade operations on February 6, 2027**, with the parade scheduled to begin at 4:00 PM local time.

The simulator can preserve the local clock time of a real historical case while mapping the archived data onto the 2027 exercise date. This keeps the meteorology spatially authentic to the LIX area while preventing the source date from giving the case away.

## Primary candidate — December 14, 2022

**Recommendation: use this as the first case, pending final exercise-team approval.**

NWS New Orleans/Baton Rouge documents several supercells and embedded tornadoes across southeast Louisiana and southern Mississippi during the late afternoon and evening. Six tornadoes were confirmed, including two EF2 tornadoes in the New Orleans metro area.

The Marrero–Gretna–Algiers–Arabi EF2 is especially well aligned with the Endymion scenario:

- Tornado began near Marrero at **3:49 PM CST**
- Tornado ended near Chalmette at **4:06 PM CST**
- Track length: **10.72 miles**
- Maximum estimated wind: **125 mph**
- Six injuries, no fatalities
- The storm crossed the Mississippi River and affected multiple portions of metro New Orleans

That timing is unusually useful because the most consequential part of the historical event occurs almost exactly at Endymion's 4:00 PM scheduled start. A displaced-real-time window beginning around 2:45 PM CST gives teams time to monitor the environment, communicate rising concern, and make a pre-start recommendation before the highest-impact portion of the case.

Sources:

- NWS LIX event review: https://www.weather.gov/lix/121422severe
- NWS LIX Marrero-to-Arabi tornado survey: https://www.weather.gov/lix/marrerotornado12142022

## Alternate — March 22, 2022

This event produced an EF3 tornado from the Gretna/Harvey area through Arabi and into New Orleans East from roughly **7:21–7:38 PM CDT**.

Advantages:

- Direct metro New Orleans impact
- Strong radar signal and high-consequence decision environment
- Useful if the exercise should emphasize an event already underway rather than a pre-parade start decision

Disadvantage:

- The time of day is much later than the 4 PM Endymion start and would require a larger time shift.

Sources:

- https://www.weather.gov/lix/03222022severe
- https://www.weather.gov/lix/arabitornado03222022

## Alternate — April 10, 2024

This event featured a severe convective line, multiple tornadoes, damaging wind, and extensive New Orleans metro flash flooding.

Advantages:

- Strong multi-hazard exercise potential
- Excellent for combining radar, mesoanalysis, severe-weather DSS, and route-access flooding impacts

Disadvantage:

- Primary impacts occurred during the morning/early afternoon, so it is less naturally aligned with Endymion's late-afternoon start.
- The broader multi-hazard scope may distract from the first simulator exercise's intended lightning/severe-weather focus.

Source:

- https://www.weather.gov/lix/041024_severeandflood

## Data availability considerations

For the primary candidate, the intended scenario package should include:

- KLIX Level II radar
- GOES ABI imagery
- GOES GLM
- LightningCast if an archived product can be obtained or recreated from archived GOES imagery
- MRMS products where archived data are available
- Surface observations
- Environmental analyses/guidance appropriate to the case
- Historical watches/warnings, time-shifted for exercise presentation where useful

## Time mapping

When building a scenario cache, use the simulator's time-remapping options so that historical data keep their original **local clock time** but are presented on the exercise date.

Example for a December 14, 2022 case mapped to Endymion 2027:

```bash
python scripts/build_radar_cache.py \
  --scenario-id mardi-gras-dss-001 \
  --input data/raw/nexrad/20221214 \
  --site KLIX \
  --simulation-date 2027-02-06 \
  --timezone America/Chicago
```

The source filename remains available to facilitators in the manifest for traceability, but participant-facing timestamps use the exercise date/time.
