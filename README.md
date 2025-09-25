# Washing Weather for Home Assistant

A custom Home Assistant integration that provides washing and drying advice based on current and forecasted weather conditions.

Tells us the weekly forecast of where we live.

If its about to rain, notify us to take the washing off the line!

## Features

- **Current Weather**: Displays current weather conditions including temperature, humidity, wind bearing compass and wind speed.
- **Drying Advice**: Provides recommendations on whether it's a good day to dry clothes outside.
- **Weekly Forecast**: Shows weather forecast for each day.


## Installation

1. Copy the javascript (.js) file into Home Assistant's `custom_cards` directory:
   - Destination: `~<config>~/www/custom_cards/`
   - You may need to make the directory if it is not there.


### Add the resource in Home Assistant

1. In Home Assistant UI, go to: Settings → Dashboards → Resources → Add resource
2. Resource URL: `/www/custom_cards/washing-weather-card.js`
3. Resource Type: `Module`
4. Save, then shift + refresh your browser. (clears cache)


### Setup bedsheet tracking

For the first time implementing this, we need to store the bedsheet date in HA's configuration.yaml file.

```yaml
input_datetime:
  bedsheet_last_changed:
    name: Last Bedsheet Change
    has_date: true
    has_time: false
```

### Use the card

- Add a new card to a dashboard with type `custom:washing-weather-card` and configure the entity, for example:
  ```yaml
  type: custom:washing-weather-card
  ```