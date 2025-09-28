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


### Setup bedsheet tracking & notifications

For the first time implementing this, we need to store the bedsheet date in Home Assistant's configuration.yaml file.

```yaml
# Bedsheet tracking
input_datetime:
  bedsheet_last_changed:
    name: Last Bedsheet Change
    has_date: true

# Discord webhook functionality
input_boolean:
  rain_alert_sent:
    name: "Rain Alert Sent This Hour"
    initial: false

automation:
  - alias: "Reset Rain Alert Hourly"
    trigger:
      - platform: time_pattern
        minutes: 0  # Every hour at :00
    action:
      - service: input_boolean.turn_off
        target:
          entity_id: input_boolean.rain_alert_sent

shell_command:
  discord_rain_alert: 'curl -X POST -H "Content-Type: application/json" -d "{\"content\":\"🌧️ **RAIN ALERT** - Take the washing inside! Rain expected in the next hour.\"}" !secret discord_webhook'
```



### Setup Discord webhook

If you would like to receive notifications that the giant rain cloud is about to ruin days of drying clothes, you can set up a Discord webhook.

Emplace the following in your existing secrets.yaml file for storing the webhook in a private area.

The file is typically found at `<config>~/secrets.yaml`

```yaml
DISCORD_WEBHOOK_URL: https://discord.com/api/webhooks/your_webhook_url_here
```

### Use the card

- Add a new card to a dashboard with type `custom:washing-weather-card` and configure the entity, for example:
  ```yaml
  type: custom:washing-weather-card
  ```