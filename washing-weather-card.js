customElements.define('washing-weather-card', class extends HTMLElement {

  DRY_TEMPERATURE_THRESHOLD = 15; // C
  DRY_HUMIDITY_THRESHOLD = 70; // %
  DRY_LOW_WIND_SPEED_THRESHOLD = 0; // km/h
  DRY_HIGH_WIND_SPEED_THRESHOLD = 40; //km/h

  // Bedsheet configuration
  BEDSHEET_CHANGE_INTERVAL = 14; // days

  constructor() {
    super();
    this._hass = null;
    this.bedsheetData = null;
  }

  setConfig(config) {
    this.config = config || {};
  }

  set hass(hass) {
    this._hass = hass;
    this.updateWeatherData();
  }

  async updateWeatherData() {
    if (!this._hass) return;

    // Create card HTML if doesn't exist
    if (!this.innerHTML) {
      this.innerHTML = `
        <ha-card>
          <div class="card-header">
            <div class="header-content">
              <div class="header-title">Washing Weather</div>
              <div class="last-updated" id="last-updated">Last updated: —</div>
            </div>
            <ha-icon-button 
              class="refresh-button" 
              id="refresh-btn"
              label="Refresh"
            >
              <ha-icon icon="mdi:refresh"></ha-icon>
            </ha-icon-button>
          </div>
          <div class="card-content">
            <div id="weather-info">Loading weather data...</div>
          </div>
        </ha-card>
      `;

      // Add styles
      if (!this.querySelector('style')) {
        const style = document.createElement('style');
        style.textContent = this.getStyles();
        this.appendChild(style);
      }

      // Add refresh button functionality
      const refreshBtn = this.querySelector('#refresh-btn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => this.refreshWeather());
      }
    }

    const contentDiv = this.querySelector('#weather-info');
    const lastUpdatedDiv = this.querySelector('#last-updated');
    
    // Try different common weather entity names
    let weatherEntity = this._hass.states['weather.forecast_home'];

    // Log which weather entity is being used
    if (weatherEntity) {
      console.log('Using weather entity:', weatherEntity.entity_id || 'Unknown entity ID');
    }
    
    // Log all weather entities for debugging
    // console.log('Available weather entities:', 
    //   Object.keys(this._hass.states).filter(key => key.startsWith('weather.')));
    
    if (!weatherEntity) {
      if (contentDiv) contentDiv.innerHTML = this.renderError('Weather entity not found');
      console.log('Weather entity weather.forecast_home not found');
      return;
    }
    
    // Update last updated time
    if (lastUpdatedDiv && weatherEntity.last_updated) {
      const lastUpdated = new Date(weatherEntity.last_updated).toLocaleTimeString();
      lastUpdatedDiv.textContent = `Last updated: ${lastUpdated}`;
    }
    
    // Log complete weather entity for debugging
    console.log('=== COMPLETE WEATHER ENTITY OBJECT ===');
    console.log('weatherEntity object:', weatherEntity);
    console.log('weatherEntity keys:', Object.keys(weatherEntity));
    
    // Extract basic weather data (no forecast here)
    const weatherData = {
      condition: weatherEntity.state,
      temperature: weatherEntity.attributes.temperature,
      humidity: weatherEntity.attributes.humidity,
      wind_speed: weatherEntity.attributes.wind_speed,
      wind_bearing: weatherEntity.attributes.wind_bearing,
      precipitation: weatherEntity.attributes.precipitation || 0,
      precipitation_probability: weatherEntity.attributes.precipitation_probability || 0,
      precipitation_unit: weatherEntity.attributes.precipitation_unit || 'mm',
      forecast: [], // Will be populated by service call
      hourly_forecast: [] // Will be populated by service call
    };

    // Get forecast data via service calls
    try {
      // Try to get daily forecast
      console.log('Attempting to fetch daily forecast...');
      const dailyForecast = await this.getForecastData('daily');
      if (dailyForecast && dailyForecast.length > 0) {
        weatherData.forecast = dailyForecast;
        console.log('Successfully loaded daily forecast:', dailyForecast.length, 'days');
      } else {
        console.warn('No daily forecast data received');
      }

      // Try to get hourly forecast
      console.log('Attempting to fetch hourly forecast...');
      const hourlyForecast = await this.getForecastData('hourly');
      if (hourlyForecast && hourlyForecast.length > 0) {
        weatherData.hourly_forecast = hourlyForecast;
        console.log('Successfully loaded hourly forecast:', hourlyForecast.length, 'hours');
      } else {
        console.warn('No hourly forecast data received');
      }
    } catch (error) {
      console.error('Error fetching forecast data:', error);
    }

    // Get washing advice
    const washingAdvice = this.getWashingAdvice(weatherData);
    
    // Calculate dry/rain windows
    const rainWindows = this.calculateRainWindows(weatherData);
    
    // Get bedsheet status
    const bedsheetStatus = this.getBedsheetStatus();
    
    // Log weather data
    console.log('=== FINAL WEATHER DATA ===');
    console.log(JSON.stringify(weatherData, null, 2));
    
    // Update display with enhanced UI
    if (contentDiv) {
      contentDiv.innerHTML = this.renderWeatherContent(weatherData, washingAdvice, rainWindows, bedsheetStatus);
      
      // Add event listeners after rendering content
      this.attachBedsheetEventListeners();
    }
  }

  // Add this new method to handle event listeners
  attachBedsheetEventListeners() {
    // Set Date button
    const setButton = this.querySelector('.bedsheet-button.set-button');
    if (setButton) {
      setButton.removeEventListener('click', this.handleSetButtonClick); // Remove old listener
      setButton.addEventListener('click', this.handleSetButtonClick.bind(this));
    }

    // Changed button
    const changedButton = this.querySelector('.bedsheet-button:not(.set-button)');
    if (changedButton) {
      changedButton.removeEventListener('click', this.handleChangedButtonClick); // Remove old listener
      changedButton.addEventListener('click', this.handleChangedButtonClick.bind(this));
    }

    // Calendar input
    const calendarInput = this.querySelector('#date');
    if (calendarInput) {
      calendarInput.removeEventListener('change', this.handleCalendarChange); // Remove old listener
      calendarInput.addEventListener('change', this.handleCalendarChange.bind(this));
    }

    // Quick date buttons
    const todayButton = this.querySelector('.calendar-buttons button:nth-child(1)');
    const weekButton = this.querySelector('.calendar-buttons button:nth-child(2)');
    const twoWeekButton = this.querySelector('.calendar-buttons button:nth-child(3)');

    if (todayButton) {
      todayButton.removeEventListener('click', this.handleTodayClick);
      todayButton.addEventListener('click', this.handleTodayClick.bind(this));
    }
    if (weekButton) {
      weekButton.removeEventListener('click', this.handleWeekClick);
      weekButton.addEventListener('click', this.handleWeekClick.bind(this));
    }
    if (twoWeekButton) {
      twoWeekButton.removeEventListener('click', this.handleTwoWeekClick);
      twoWeekButton.addEventListener('click', this.handleTwoWeekClick.bind(this));
    }
  }

  // Event handler methods
  handleSetButtonClick(event) {
    event.preventDefault();
    this.showBedsheetOptions();
  }

  async handleChangedButtonClick(event) {
    event.preventDefault();
    await this.markBedsheetsChanged();
  }

  async handleCalendarChange(event) {
    await this.setBedsheetDateFromCalendar(event.target.value);
  }

  async handleTodayClick(event) {
    event.preventDefault();
    await this.setBedsheetDate(0);
  }

  async handleWeekClick(event) {
    event.preventDefault();
    await this.setBedsheetDate(7);
  }

  async handleTwoWeekClick(event) {
    event.preventDefault();
    await this.setBedsheetDate(14);
  }

  // Get bedsheet data from memory
  getBedsheetData() {
    // Store in a global variable attached to the card element
    if (!this.bedsheetData) {
      // Initialize with default data
      this.bedsheetData = {
        lastChanged: null, // Date string
        interval: this.BEDSHEET_CHANGE_INTERVAL
      };
    }
    return this.bedsheetData;
  }

  // Save bedsheet data
  setBedsheetData(data) {
    this.bedsheetData = { ...data };
  }

  // Calculate bedsheet status
  getBedsheetStatus() {
    const data = this.getBedsheetData();

    //  Extract the bedsheet entity from configuration.yaml
    const entity = this._hass?.states['input_datetime.bedsheet_last_changed'];
    const lastChanged = entity?.state;
    
    console.log('Bedsheet entity state:', lastChanged);
    
    if (!lastChanged || lastChanged === 'unknown' || !this._hass) {
      return {
        status: 'unknown',
        daysSince: 0,
        interval: data.interval,
        icon: 'mdi:bed-outline',
        text: 'Set when you last changed bedsheets',
        color: '#FFC107',
        showSetButton: true
      };
    }
    
    const lastChangedDate = new Date(lastChanged);
    const now = new Date();
    const daysSince = Math.floor((now - lastChangedDate) / (1000 * 60 * 60 * 24));
    
    let status, icon, text, color;
    
    if (daysSince >= data.interval) {
      status = 'overdue';
      icon = 'mdi:bed-empty';
      text = `Bedsheets overdue! ${daysSince}/${data.interval} days`;
      color = '#F44336';
    } else if (daysSince >= data.interval * 0.8) {
      status = 'due_soon';
      icon = 'mdi:bed';
      text = `Change bedsheets soon (${daysSince}/${data.interval} days)`;
      color = '#FFC107';
    } else {
      status = 'clean';
      icon = 'mdi:bed-outline';
      text = `Bedsheets clean (${daysSince}/${data.interval} days)`;
      color = '#4CAF50';
    }
    
    const nextChange = new Date(lastChangedDate.getTime() + (data.interval * 24 * 60 * 60 * 1000));
    
    return {
      status,
      daysSince,
      interval: data.interval,
      nextChange: nextChange.toLocaleDateString(),
      icon,
      text,
      color,
      showSetButton: false
    };
  }

  // Mark bedsheets as changed today
  async markBedsheetsChanged() {
    if (!this._hass) {
      console.warn('No Home Assistant instance available');
      return;
    }
    
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      console.log('Setting bedsheet date to today:', today);
      
      // Call Home Assistant service to set the input_datetime
      // For input_datetime with has_time: false, we use the date parameter
      await this._hass.callService('input_datetime', 'set_datetime', {
        entity_id: 'input_datetime.bedsheet_last_changed',
        date: today
      });
      
      console.log('Bedsheet date set successfully');
      
      // Re-render the card
      this.updateWeatherData();
    } catch (error) {
      console.error('Error setting bedsheet date:', error);
    }
  }

  // Set initial bedsheet change date
  async setBedsheetDate(daysAgo = 0) {
    if (!this._hass) {
      console.warn('No Home Assistant instance available');
      return;
    }
    
    try {
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      const dateString = date.toISOString().split('T')[0];
      console.log('Setting bedsheet date to:', dateString, '(', daysAgo, 'days ago)');
      
      // Call Home Assistant service to set the input_datetime
      // For input_datetime with has_time: false, we use the date parameter
      await this._hass.callService('input_datetime', 'set_datetime', {
        entity_id: 'input_datetime.bedsheet_last_changed',
        date: dateString
      });
      
      console.log('Bedsheet date set successfully');
      
      // Re-render the card
      this.updateWeatherData();
    } catch (error) {
      console.error('Error setting bedsheet date:', error);
    }
  }

  // Show bedsheet date options
  showBedsheetOptions() {
    console.log('showBedsheetOptions called');
    const options = this.querySelector('#bedsheet-options');
    console.log('bedsheet-options element found:', !!options);
    
    if (options) {
      const isVisible = options.style.display === 'none';
      console.log('Current visibility:', options.style.display, 'Will show:', isVisible);
      options.style.display = isVisible ? 'block' : 'none';
      
      // Set calendar value when opening
      if (isVisible) {
        const calendar = this.querySelector('#date');
        console.log('Calendar element found:', !!calendar);
        
        if (calendar) {
          const entity = this._hass?.states['input_datetime.bedsheet_last_changed'];
          const lastChanged = entity?.state;
          console.log('Current bedsheet entity state:', lastChanged);
          
          if (lastChanged && lastChanged !== 'unknown') {
            calendar.value = lastChanged;
            console.log('Set calendar to entity value:', lastChanged);
          } else {
            const today = new Date().toISOString().split('T')[0];
            calendar.value = today;
            console.log('Set calendar to today:', today);
          }
        }
      }
    }
  }

  // Set bedsheet date from calendar input
  async setBedsheetDateFromCalendar(dateString) {
    console.log('setBedsheetDateFromCalendar called with:', dateString);
    if (!dateString || !this._hass) {
      console.warn('No date string or Home Assistant instance available');
      return;
    }
    
    try {
      console.log('Setting bedsheet date from calendar:', dateString);
      
      // Call Home Assistant service to set the input_datetime
      // For input_datetime with has_time: false, we use the date parameter
      await this._hass.callService('input_datetime', 'set_datetime', {
        entity_id: 'input_datetime.bedsheet_last_changed',
        date: dateString
      });
      
      console.log('Bedsheet date set successfully from calendar');
      
      // Re-render the card
      this.updateWeatherData();
    } catch (error) {
      console.error('Error setting bedsheet date from calendar:', error);
    }
  }

  /**
   * Get weather forecast data from Home Assistant
   * Uses the weather.get_forecasts service
   * 
   * @note filters dry/wet windows from now and onwards of today (as previous hours are useless information)
   * https://www.home-assistant.io/docs/scripts/#call-a-service @ callService
   * https://www.home-assistant.io/integrations/weather/
   * @param forecastType - either 'daily', 'hourly', or 'twice_daily'
   * @returns Promise<Array|null> - Array of forecast objects or null if failed
   */
  async getForecastData(forecastType) {
    if (!this._hass) {
      console.warn('No Home Assistant instance available');
      return null;
    }
    
    try {
      console.log(`Calling weather.get_forecasts service for ${forecastType} forecast...`);
      
      const serviceData = {
        type: forecastType
      };
      
      const target = {
        entity_id: 'weather.forecast_home'
      };
    
      // Correct approach: Use callWS directly for services that return response data
      const response = await this._hass.callWS({
        type: 'call_service',
        domain: 'weather',
        service: 'get_forecasts',
        service_data: serviceData,
        target: target,
        return_response: true
      });
    
  
      console.log(`${forecastType} forecast service response:`, response);
  
      // Check if we got the expected response structure
      // WebSocket API wraps the response in a response object
      let forecastData = null;
      
      if (response && response.response && response.response['weather.forecast_home'] && response.response['weather.forecast_home'].forecast) {
        // Response from callWS has the data wrapped in response.response
        forecastData = response.response['weather.forecast_home'].forecast;
      } else if (response && response['weather.forecast_home'] && response['weather.forecast_home'].forecast) {
        // Direct response format (fallback)
        forecastData = response['weather.forecast_home'].forecast;
      }
      
      if (forecastData && forecastData.length > 0) {
        console.log(`Got ${forecastData.length} ${forecastType} forecast entries`);
        return forecastData;
      } else {
        console.warn(`Unexpected response structure for ${forecastType} forecast:`, response);
        console.warn('Expected structure: { response: { "weather.forecast_home": { "forecast": [...] } } }');
        return null;
      }
      
    } catch (error) {
      console.error(`Error fetching ${forecastType} forecast:`, error);
      return null;
    }
  }

  async refreshWeather() {
    const refreshBtn = this.querySelector('#refresh-btn');
    if (refreshBtn) {
      refreshBtn.classList.add('refreshing');
      // Remove refreshing class after animation
      setTimeout(() => {
        refreshBtn.classList.remove('refreshing');
      }, 2000);
    }
    
    // Trigger entity update if possible
    if (this._hass && this._hass.callService) {
      try {
        console.log('Refreshing weather entity...');
        await this._hass.callService('homeassistant', 'update_entity', {
          entity_id: 'weather.forecast_home'
        });
        // Re-fetch weather data after update
        console.log('Re-fetching weather data after refresh...');
        await this.updateWeatherData();
      } catch (err) {
        console.error('Error refreshing weather data:', err);
      }
    }
  }

  calculateRainWindows(weatherData) {
    console.log('=== CALCULATING DRYING WINDOWS ===');
   
    let hourlyData = weatherData.hourly_forecast || [];
   
    if (hourlyData.length === 0) {
      return {
        dryWindows: [],
        rainWindows: [],
        message: 'Hourly forecast not available'
      };
    }
   
    // get current time so we can only return future hours
    const now = new Date();
    
    // Filter for future daytime hours only (7am - 7pm)
    const futureDaytimeHours = hourlyData.filter(hour => {
      const date = new Date(hour.datetime);
      const hour24 = date.getHours();
      const isDaytime = hour24 >= 7 && hour24 < 19;
      const isFuture = date > now;
      return isDaytime && isFuture;
    });
   
    if (futureDaytimeHours.length === 0) {
      return {
        dryWindows: [],
        rainWindows: [],
        message: 'No future daytime hours available'
      };
    }
   
    // Check for rain during future daytime hours
    const rainyHours = [];
    const dryHours = [];
    
    futureDaytimeHours.forEach(hour => {
      const date = new Date(hour.datetime);
      const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      const precipProbability = hour.precipitation_probability || 0;
      const precipitation = hour.precipitation || 0;
      const condition = (hour.condition || '').toLowerCase();
     
      const isRainy = precipProbability > 30 || precipitation > 0 ||
                     condition.includes('rain') || condition.includes('storm') || condition.includes('drizzle');
     
      if (isRainy) {
        rainyHours.push({ time, hour, precipitation, precipProbability });
      } else {
        dryHours.push({ time, hour });
      }
    });
   
    // Smart summary logic
    const totalFutureHours = futureDaytimeHours.length;
    const rainyHoursCount = rainyHours.length;
    const dryHoursCount = dryHours.length;
    
    console.log(`Future daytime analysis: ${totalFutureHours} total hours, ${rainyHoursCount} rainy, ${dryHoursCount} dry`);
   
    // Generate human-friendly messages for future hours only
    const dryWindows = [];
    const rainWindows = [];
   
    if (rainyHoursCount === 0) {
      // Perfect remaining day - no rain during future daytime hours
      if (totalFutureHours > 6) {
        dryWindows.push("Rest of the day");
      } else {
        const firstHour = futureDaytimeHours[0];
        const lastHour = futureDaytimeHours[futureDaytimeHours.length - 1];
        const startTime = new Date(firstHour.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        const endTime = new Date(lastHour.datetime).getHours() === 18 ? "7:00 PM" : 
          new Date(new Date(lastHour.datetime).getTime() + 60*60*1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        dryWindows.push(`${startTime} - ${endTime}`);
      }
    } else if (rainyHoursCount <= 2) {
      // Mostly good with brief rain
      if (rainyHours.length === 1) {
        const rainTime = rainyHours[0].time;
        rainWindows.push(`Brief shower around ${rainTime}`);
      } else {
        // Find rain period
        const firstRain = rainyHours[0].time;
        const lastRain = rainyHours[rainyHours.length - 1].time;
        rainWindows.push(`${firstRain} - ${lastRain}`);
      }
      dryWindows.push("Most remaining daylight hours");
    } else if (rainyHoursCount >= totalFutureHours * 0.7) {
      // Mostly rainy remaining day
      rainWindows.push("Most remaining daylight hours");
      if (dryHoursCount > 0) {
        dryWindows.push("Brief dry periods");
      }
    } else {
      // Mixed remaining day - build actual future windows
      let currentDryStart = null;
      let currentRainStart = null;
      
      futureDaytimeHours.forEach((hour, index) => {
        const date = new Date(hour.datetime);
        const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        const precipProbability = hour.precipitation_probability || 0;
        const precipitation = hour.precipitation || 0;
        const condition = (hour.condition || '').toLowerCase();
       
        const isRainy = precipProbability > 30 || precipitation > 0 ||
                       condition.includes('rain') || condition.includes('storm') || condition.includes('drizzle');
       
        if (isRainy) {
          if (currentDryStart !== null) {
            const endTime = index > 0 ? time : time;
            dryWindows.push(`${currentDryStart} - ${endTime}`);
            currentDryStart = null;
          }
          if (currentRainStart === null) {
            currentRainStart = time;
          }
        } else {
          if (currentRainStart !== null) {
            const endTime = index > 0 ? time : time;
            rainWindows.push(`${currentRainStart} - ${endTime}`);
            currentRainStart = null;
          }
          if (currentDryStart === null) {
            currentDryStart = time;
          }
        }
       
        // Handle last future hour
        if (index === futureDaytimeHours.length - 1) {
          const lastHourTime = new Date(hour.datetime);
          const isLastHourAt6PM = lastHourTime.getHours() === 18;
          const endTimeStr = isLastHourAt6PM ? "7:00 PM" : 
            new Date(lastHourTime.getTime() + 60*60*1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
            
          if (currentDryStart !== null) {
            dryWindows.push(`${currentDryStart} - ${endTimeStr}`);
          }
          if (currentRainStart !== null) {
            rainWindows.push(`${currentRainStart} - ${endTimeStr}`);
          }
        }
      });
    }
   
    console.log('Future drying windows:', dryWindows);
    console.log('Future rain periods to avoid:', rainWindows);
   
    return {
      dryWindows,
      rainWindows,
      message: null
    };
  }

  getWashingAdvice(weatherData) {
    const temp = weatherData.temperature || 0;
    const humidity = weatherData.humidity || 0;
    const windSpeed = weatherData.wind_speed || 0;
    const condition = (weatherData.condition || '').toLowerCase();

    console.log('Getting washing advice for:', { temp, humidity, windSpeed, condition });
    
    const dryDay = (
      temp > this.DRY_TEMPERATURE_THRESHOLD && 
      humidity < this.DRY_HUMIDITY_THRESHOLD && 
      windSpeed > this.DRY_LOW_WIND_SPEED_THRESHOLD && 
      windSpeed < this.DRY_HIGH_WIND_SPEED_THRESHOLD &&
      !condition.includes('rain') &&
      !condition.includes('snow') &&
      !condition.includes('storm')
    );
    
    if (dryDay) {
      return {
        icon: 'mdi:tshirt-crew-outline',
        text: 'Great day for drying outside!',
        color: '#4CAF50'
      };
    }

    // didnt pass dryDay, check more.. to see what kind of weather we have today
    
    if (condition.includes('rain') || condition.includes('snow') || condition.includes('storm')) {
      return {
        icon: 'mdi:weather-rainy',
        text: 'Rainy day! Use dryer today.',
        color: '#F44336',
      };
    }
    
    if (humidity >= this.DRY_HUMIDITY_THRESHOLD) {
      return {
        icon: 'mdi:water-percent',
        text: 'High humidity - drying will be slow. Use dryer today.',
        color: '#FFC107',
      };
    }
    
    if (windSpeed < this.DRY_LOW_WIND_SPEED_THRESHOLD) {
      return {
        icon: 'mdi:weather-windy',
        text: 'Not enough wind for good drying. Use dryer today.',
        color: '#FFC107',
      };
    }
    
    if (windSpeed > this.DRY_HIGH_WIND_SPEED_THRESHOLD) {
      return {
        icon: 'mdi:weather-windy',
        text: 'Very windy, clothes may fly away! Make sure iron horse is secure.',
        color: '#F44336',
      };
    }
    

    // else:
    return {
      icon: 'mdi:washing-machine',
      text: 'Consider using the dryer.',
      color: '#FFC107',
    };
  }

  getWeatherIcon(condition) {
    if (!condition) return 'mdi:weather-sunny';
    
    const conditionLower = condition.toLowerCase();
    if (conditionLower.includes('clear-night')) return 'mdi:weather-night';
    if (conditionLower.includes('cloud')) return 'mdi:weather-cloudy';
    if (conditionLower.includes('fog') || conditionLower.includes('mist')) return 'mdi:weather-fog';
    if (conditionLower.includes('rain')) return 'mdi:weather-rainy';
    if (conditionLower.includes('snow')) return 'mdi:weather-snowy';
    if (conditionLower.includes('sunny') || conditionLower === 'clear') return 'mdi:weather-sunny';
    if (conditionLower.includes('windy')) return 'mdi:weather-windy';
    
    return 'mdi:weather-sunny';
  }

  renderWeatherContent(weatherData, washingAdvice, rainWindows, bedsheetStatus) {
    const temp = Math.round(weatherData.temperature || 0);
    const condition = weatherData.condition || 'N/A';
    
    return `
      <div class="current-weather">
        <div class="weather-icon">
          <ha-icon icon="${this.getWeatherIcon(weatherData.condition)}"></ha-icon>
          <div class="temp">${temp}°C</div>
          <div class="condition">${condition}</div>
        </div>
        
        <div class="weather-details">
          <div class="detail">
            <div class="detail-label">Humidity</div>
            <div class="detail-content">
              <ha-icon icon="mdi:water-percent"></ha-icon>
              <span>${weatherData.humidity || 0}%</span>
            </div>
          </div>
          <div class="detail wind-detail">
            <div class="detail-label">Wind</div>
            <div class="detail-content">
              <div class="wind-compass">
                <div class="compass-face">
                  <div class="compass-directions">
                    <span class="compass-n">N</span>
                    <span class="compass-e">E</span>
                    <span class="compass-s">S</span>
                    <span class="compass-w">W</span>
                  </div>
                  <div class="compass-needle" style="transform: rotate(${weatherData.wind_bearing || 0}deg)"></div>
                  <div class="compass-center"></div>
                </div>
              </div>
              <div class="wind-info">
                <span class="wind-speed">${weatherData.wind_speed || 0} km/h</span>
                <span class="wind-bearing">${Math.round(weatherData.wind_bearing || 0)}°</span>
              </div>
            </div>
          </div>
          ${weatherData.precipitation !== undefined ? `
            <div class="detail">
              <div class="detail-label">Rain</div>
              <div class="detail-content">
                <ha-icon icon="mdi:weather-rainy"></ha-icon>
                <span>${weatherData.precipitation} mm</span>
              </div>
            </div>
          ` : ''}
        </div>
        
        <div class="washing-advice" style="--advice-color: ${washingAdvice.color}">
          <ha-icon icon="${washingAdvice.icon}"></ha-icon>
          <span>${washingAdvice.text}</span>
        </div>
      </div>
      
      ${this.renderBedsheetTracker(bedsheetStatus)}
      
      ${this.renderRainWindows(rainWindows)}
      
      ${weatherData.forecast && weatherData.forecast.length > 0 ? this.renderForecast(weatherData.forecast) : ''}
      
      <p style="margin-top: 15px; font-size: 0.8em; color: var(--secondary-text-color);"><em>Check console for full JSON data</em></p>
    `;
  }
  
  /**
   * Renders the rain windows
   * @param {*} rainWindows Array of forecast objects in beautiful colourful format, depending on its dry or wet time windows
   * @returns HTML string representing the rain windows
   */
  renderRainWindows(rainWindows) {
    if (!rainWindows || rainWindows.message) {
      return `
        <div class="rain-forecast">
          <div class="forecast-header">Today's Drying Windows</div>
          <div class="no-rain">
            <ha-icon icon="mdi:information"></ha-icon>
            <span>${rainWindows?.message || 'Hourly forecast not available'}</span>
          </div>
        </div>
      `;
    }
  
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
  
    // Helper function to check if a time window is in the future
    const isWindowInFuture = (windowStr) => {
      if (!windowStr || typeof windowStr !== 'string') return false;
      
      // Handle descriptive windows (these are already filtered in calculateRainWindows)
      if (windowStr.includes('Rest of') || windowStr.includes('Most remaining') || 
          windowStr.includes('Brief shower around') || windowStr.includes('All day')) {
        return true;
      }
  
      // Parse time ranges like "07:00 am - 10:00 am" or "11:00 am - 04:00 pm"
      const timeRangeMatch = windowStr.match(/(\d{1,2}:\d{2}\s*[ap]m)\s*-\s*(\d{1,2}:\d{2}\s*[ap]m)/i);
      if (!timeRangeMatch) return true; // If we can't parse it, show it to be safe
  
      const [, startTimeStr, endTimeStr] = timeRangeMatch;
      
      // Convert time strings to 24-hour format for comparison
      const parseTime = (timeStr) => {
        const cleanTime = timeStr.trim().toLowerCase();
        const [time, period] = cleanTime.split(/\s*([ap]m)/);
        const [hours, minutes] = time.split(':').map(Number);
        
        let hour24 = hours;
        if (period === 'pm' && hours !== 12) hour24 += 12;
        if (period === 'am' && hours === 12) hour24 = 0;
        
        return { hour: hour24, minute: minutes };
      };
  
      try {
        const startTime = parseTime(startTimeStr);
        const endTime = parseTime(endTimeStr);
        
        // Check if the entire window is in the past
        const currentTimeMinutes = currentHour * 60 + currentMinutes;
        const endTimeMinutes = endTime.hour * 60 + endTime.minute;
        
        // If end time is past current time, the window is still relevant
        return endTimeMinutes > currentTimeMinutes;
        
      } catch (error) {
        console.warn('Error parsing time window:', windowStr, error);
        return true; // Show it if we can't parse it
      }
    };
  
    // Filter windows to only show future ones
    const futureRainWindows = rainWindows.rainWindows ? 
      rainWindows.rainWindows.filter(isWindowInFuture) : [];
    const futureDryWindows = rainWindows.dryWindows ? 
      rainWindows.dryWindows.filter(isWindowInFuture) : [];
  
    const hasDryWindows = futureDryWindows.length > 0;
    const hasRainWindows = futureRainWindows.length > 0;
  
    if (!hasDryWindows && !hasRainWindows) {
      return `
        <div class="rain-forecast">
          <div class="forecast-header">Today's Drying Windows</div>
          <div class="no-rain">
            <ha-icon icon="mdi:weather-sunny"></ha-icon>
            <span>No more drying opportunities today</span>
          </div>
        </div>
      `;
    }
  
    let content = `<div class="rain-forecast"><div class="forecast-header">Today's Drying Windows</div>`;
  
    // Show dry windows (good for drying)
    if (hasDryWindows) {
      content += `<div class="dry-windows">`;
      futureDryWindows.forEach(window => {
        content += `
          <div class="dry-window">
            <ha-icon icon="mdi:tshirt-crew"></ha-icon>
            <span><strong>Good for drying:</strong> ${window}</span>
          </div>
        `;
      });
      content += `</div>`;
    }
  
    // Show rain windows (only future specific times, not "most of day")
    if (hasRainWindows) {
      const specificRainWindows = futureRainWindows.filter(window => 
        !window.includes('Most of') && !window.includes('Brief shower')
      );
      
      if (specificRainWindows.length > 0) {
        content += `<div class="rain-windows">`;
        // loop through each future rainwindow, append each window to ui
        specificRainWindows.forEach(window => {
          content += `
            <div class="rain-window">
              <ha-icon icon="mdi:weather-rainy"></ha-icon>
              <span><strong>Avoid drying:</strong> ${window}</span>
            </div>
          `;
        });
        content += `</div>`;
      }
    }
  
    // Smart summary message (using filtered windows)
    const allDayDrying = futureDryWindows.some(w => w.includes('All day'));
    const mostlyDry = futureDryWindows.some(w => w.includes('Most of') || w.includes('Rest of'));
    const mostlyRainy = futureRainWindows.some(w => w.includes('Most of'));
    const briefShower = futureRainWindows.some(w => w.includes('Brief shower'));
  
    if (allDayDrying) {
      content += `
        <div class="window-summary excellent">
          <ha-icon icon="mdi:weather-sunny"></ha-icon>
          <span>Perfect day for outdoor drying!</span>
        </div>
      `;
    } else if (mostlyDry || briefShower) {
      content += `
        <div class="window-summary good">
          <ha-icon icon="mdi:weather-partly-cloudy"></ha-icon>
          <span>Great day for outdoor drying!</span>
        </div>
      `;
    } else if (mostlyRainy) {
      content += `
        <div class="window-summary poor">
          <ha-icon icon="mdi:weather-rainy"></ha-icon>
          <span>Consider indoor drying today</span>
        </div>
      `;
    } else if (hasDryWindows || hasRainWindows) {
      content += `
        <div class="window-summary mixed">
          <ha-icon icon="mdi:weather-partly-rainy"></ha-icon>
          <span>Mixed conditions - time your drying</span>
        </div>
      `;
    }
  
    content += `</div>`;
    return content;
  }

  // Render bedsheet tracker
  renderBedsheetTracker(bedsheetStatus) {
    if (!bedsheetStatus) return '';
    
    return `
      <div class="bedsheet-tracker" style="--bedsheet-color: ${bedsheetStatus.color}">
        <div class="bedsheet-header">
          <div class="bedsheet-info">
            <ha-icon icon="${bedsheetStatus.icon}"></ha-icon>
            <span>${bedsheetStatus.text}</span>
          </div>
          <div class="bedsheet-buttons">
            <button class="bedsheet-button set-button">
              <ha-icon icon="mdi:calendar-plus"></ha-icon>
              Set Date
            </button>
            ${!bedsheetStatus.showSetButton ? `
              <button class="bedsheet-button">
                <ha-icon icon="mdi:check"></ha-icon>
                Changed
              </button>
            ` : ''}
          </div>
        </div>
        
        ${!bedsheetStatus.showSetButton && bedsheetStatus.nextChange ? `
          <div class="bedsheet-next">
            <ha-icon icon="mdi:calendar"></ha-icon>
            <span>Next change due: ${bedsheetStatus.nextChange}</span>
          </div>
        ` : ''}
        
        ${!bedsheetStatus.showSetButton ? `
          <div class="bedsheet-progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${Math.min(100, (bedsheetStatus.daysSince / bedsheetStatus.interval) * 100)}%"></div>
            </div>
            <div class="progress-text">${bedsheetStatus.daysSince} / ${bedsheetStatus.interval} days</div>
          </div>
        ` : ''}
        
        <div class="bedsheet-options" id="bedsheet-options" style="display: none;">
          <div class="calendar-container">
            <label for="date">Select last changed date:</label>
            <input
              type="date"
              id="date"
              name="date"
              value="${bedsheetStatus.lastChanged ? new Date(bedsheetStatus.lastChanged).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}"
              class="bedsheet-date-input block bg-background w-full pl-4 pr-10 py-2.5 border border-border rounded-lg text-content-primary placeholder:text-content-white/50 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer"
              style="-webkit-appearance: none; min-height: 44px; font-size: 16px; padding-right: 2.5rem; position: relative; z-index: 1;"
              required
            />
            <div class="calendar-buttons">
              <button>Today</button>
              <button>1 week ago</button>
              <button>2 weeks ago</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Renders a 5-day forecast 
   * @param {*} forecast Array of forecast objects 
   * @returns HTML string representing the forecast
   */
  renderForecast(forecast) {
    const forecastDays = forecast.slice(0, 5).map((day) => {
      const date = new Date(day.datetime);
      const dayName = date.toLocaleDateString(undefined, { weekday: 'short' });
      const temp = Math.round(day.temperature || 0);
      const condition = day.condition || 'unknown';
      const isGood = this.isGoodForDrying(day);
      
      return `
        <div class="forecast-day ${isGood ? 'good-drying' : ''}">
          <div class="forecast-day-name">${dayName}</div>
          <ha-icon icon="${this.getWeatherIcon(condition)}"></ha-icon>
          <div class="forecast-temp">${temp}°</div>
          <div class="drying-advice">
            <ha-icon icon="${isGood ? 'mdi:tshirt-crew' : 'mdi:tshirt-crew-off'}"></ha-icon>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="forecast">
        <div class="forecast-header">5-Day Forecast</div>
        <div class="forecast-days">
          ${forecastDays}
        </div>
      </div>
    `;
  }

  isGoodForDrying(day) {
    const temp = day.temperature || 0;
    const humidity = day.humidity || 0;
    const windSpeed = day.wind_speed || 0;
    const condition = (day.condition || '').toLowerCase();

    return (
      !condition.includes('rain') &&
      !condition.includes('snow') &&
      !condition.includes('storm') &&
      temp > 15 &&
      humidity < 80 &&
      windSpeed > 2 &&
      windSpeed < 30
    );
  }

  renderError(message) {
    return `
      <div class="error">
        <ha-icon icon="mdi:alert-circle"></ha-icon>
        <span>${message}</span>
      </div>
    `;
  }

  getStyles() {
    return `
      :host {
        --primary-color: var(--ha-card-header-color, --primary-text-color);
        --secondary-color: var(--secondary-text-color);
        --success-color: #4CAF50;
        --warning-color: #FFC107;
        --error-color: #F44336;
      }

      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: 16px 16px 0 16px;
        position: relative;
      }

      .header-content {
        flex: 1;
        min-width: 0;
        padding-right: 8px;
      }

      .header-title {
        font-size: 1.2rem;
        font-weight: 500;
        color: var(--primary-color);
        margin: 0;
        line-height: 1.2;
      }

      .last-updated {
        font-size: 0.7rem;
        color: var(--secondary-text-color);
        margin-top: 2px;
        line-height: 1.2;
      }

      .refresh-button {
        --mdc-icon-button-size: 40px;
        --mdc-icon-size: 20px;
        color: var(--secondary-text-color);
        transition: transform 0.3s ease-in-out;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.05);
      }

      .refresh-button:hover {
        background: rgba(0, 0, 0, 0.1);
      }

      .refresh-button ha-icon {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .refresh-button.refreshing {
        animation: rotate 1s linear infinite;
      }

      @keyframes rotate {
        from { transform: rotate(0deg); }
        to { transform: rotate(-360deg); }
      }

      .card-content {
        padding: 16px;
      }

      .current-weather {
        display: flex;
        flex-direction: column;
        gap: 16px;
        margin-bottom: 16px;
      }

      .weather-icon {
        text-align: center;
        margin-bottom: 8px;
      }

      .weather-icon ha-icon {
        --mdc-icon-size: 64px;
        color: var(--primary-color);
      }

      .temp {
        font-size: 2.5rem;
        font-weight: 500;
        line-height: 1.2;
        color: var(--primary-color);
      }

      .condition {
        font-size: 1.1rem;
        color: var(--secondary-color);
        text-transform: capitalize;
        margin-bottom: 8px;
      }

      .weather-details {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
        gap: 12px;
        margin: 12px 0;
      }

      .detail {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 8px;
        background: rgba(0,0,0,0.03);
        border-radius: 8px;
        min-width: 100px;
      }

      .detail-label {
        font-size: 0.75rem;
        color: var(--secondary-color);
        font-weight: 500;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .detail-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }

      .detail ha-icon {
        --mdc-icon-size: 20px;
        color: var(--secondary-color);
        margin-bottom: 4px;
      }

      .detail span {
        font-size: 0.9rem;
        color: var(--primary-color);
      }

      .wind-detail {
        min-width: 120px;
      }

      .wind-detail .detail-content {
        flex-direction: row;
        align-items: center;
        gap: 12px;
      }

      .wind-compass {
        position: relative;
        width: 50px;
        height: 50px;
      }

      .compass-face {
        position: relative;
        width: 100%;
        height: 100%;
        border: 2px solid var(--secondary-color);
        border-radius: 50%;
        background: radial-gradient(circle at center, rgba(255,255,255,0.9) 0%, rgba(240,240,240,0.9) 100%);
      }

      .compass-directions {
        position: absolute;
        width: 100%;
        height: 100%;
      }

      .compass-directions span {
        position: absolute;
        font-size: 10px;
        font-weight: bold;
        color: var(--secondary-color);
      }

      .compass-n {
        top: 2px;
        left: 50%;
        transform: translateX(-50%);
      }

      .compass-e {
        right: 4px;
        top: 50%;
        transform: translateY(-50%);
      }

      .compass-s {
        bottom: 2px;
        left: 50%;
        transform: translateX(-50%);
      }

      .compass-w {
        left: 4px;
        top: 50%;
        transform: translateY(-50%);
      }

      .compass-needle {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 2px;
        height: 20px;
        background: #F44336;
        transform-origin: bottom center;
        margin-left: -1px;
        margin-top: -20px;
        border-radius: 1px 1px 0 0;
        box-shadow: 0 0 2px rgba(244, 67, 54, 0.5);
      }

      .compass-needle::after {
        content: '';
        position: absolute;
        top: -3px;
        left: 50%;
        width: 6px;
        height: 6px;
        background: #F44336;
        border-radius: 50%;
        transform: translateX(-50%);
      }

      .compass-center {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 4px;
        height: 4px;
        background: var(--secondary-color);
        border-radius: 50%;
        transform: translate(-50%, -50%);
        z-index: 2;
      }

      .wind-info {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      .wind-speed {
        font-size: 0.9rem;
        color: var(--primary-color);
        font-weight: 500;
      }

      .wind-bearing {
        font-size: 0.75rem;
        color: var(--secondary-color);
      }

      .washing-advice {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px;
        margin-top: 8px;
        border-radius: 8px;
        background-color: rgba(0, 0, 0, 0.05);
        color: var(--primary-color);
        font-weight: 500;
      }

      .washing-advice ha-icon {
        color: var(--advice-color, var(--primary-color));
      }

      .rain-forecast {
        margin: 16px 0;
        padding: 12px;
        background: rgba(0,0,0,0.02);
        border-radius: 8px;
        border-left: 4px solid var(--primary-color);
      }

      .dry-windows, .rain-windows {
        margin: 8px 0;
      }

      .dry-window, .rain-window, .no-rain, .window-summary {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        margin: 4px 0;
        border-radius: 6px;
        font-size: 0.9rem;
      }

      .dry-window {
        background: rgba(76, 175, 80, 0.1);
        color: var(--success-color);
      }

      .rain-window {
        background: rgba(244, 67, 54, 0.1);
        color: var(--error-color);
      }

      .no-rain {
        background: rgba(76, 175, 80, 0.05);
        color: var(--secondary-text-color);
      }

      .window-summary {
        background: rgba(0,0,0,0.05);
        color: var(--secondary-text-color);
        font-style: italic;
        margin-top: 8px;
      }

      .window-summary.good {
        background: rgba(76, 175, 80, 0.1);
        color: var(--success-color);
      }

      .window-summary.poor {
        background: rgba(244, 67, 54, 0.1);
        color: var(--error-color);
      }

      .dry-window ha-icon, .window-summary.good ha-icon {
        color: var(--success-color);
      }

      .rain-window ha-icon, .window-summary.poor ha-icon {
        color: var(--error-color);
      }

      .no-rain ha-icon, .window-summary ha-icon {
        --mdc-icon-size: 18px;
      }

      .forecast {
        margin-top: 16px;
      }

      .forecast-header {
        font-weight: 500;
        color: var(--secondary-color);
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(0,0,0,0.1);
      }

      .forecast-days {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 8px;
      }

      .forecast-day {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 8px;
        border-radius: 8px;
        transition: background-color 0.2s ease;
      }

      .forecast-day.good-drying {
        background-color: rgba(76, 175, 80, 0.1);
      }

      .forecast-day-name {
        font-size: 0.85rem;
        font-weight: 500;
        margin-bottom: 4px;
        color: var(--primary-color);
      }

      .forecast-day ha-icon {
        --mdc-icon-size: 24px;
        margin: 4px 0;
        color: var(--primary-color);
      }

      .forecast-temp {
        font-weight: 500;
        color: var(--primary-color);
        margin: 4px 0;
      }

      .drying-advice ha-icon {
        --mdc-icon-size: 20px;
        color: var(--success-color);
      }

      .forecast-day:not(.good-drying) .drying-advice ha-icon {
        color: var(--warning-color);
      }

      .error {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px;
        background-color: rgba(244, 67, 54, 0.1);
        border-radius: 8px;
        color: var(--error-color);
      }

      .error ha-icon {
        --mdc-icon-size: 20px;
      }

      @media (max-width: 500px) {
        .weather-details {
          grid-template-columns: repeat(2, 1fr);
        }
        
        .forecast-days {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      /* Bedsheet Tracker Styles */
      .bedsheet-tracker {
        margin: 16px 0;
        padding: 16px;
        background: rgba(0,0,0,0.02);
        border-radius: 8px;
        border-left: 4px solid var(--bedsheet-color, var(--primary-color));
      }

      .bedsheet-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }

      .bedsheet-info {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
      }

      .bedsheet-info ha-icon {
        color: var(--bedsheet-color, var(--primary-color));
        --mdc-icon-size: 24px;
      }

      .bedsheet-info span {
        font-weight: 500;
        color: var(--primary-color);
      }

      .bedsheet-buttons {
        display: flex;
        gap: 8px;
      }

      .bedsheet-button {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        border: none;
        border-radius: 6px;
        background: var(--bedsheet-color, var(--primary-color));
        color: white;
        font-size: 0.85rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .bedsheet-button:hover {
        opacity: 0.8;
        transform: translateY(-1px);
      }

      .bedsheet-button.set-button {
        background: var(--warning-color);
      }

      .bedsheet-button ha-icon {
        --mdc-icon-size: 18px;
      }

      .bedsheet-next {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
        padding: 8px 12px;
        background: rgba(0,0,0,0.03);
        border-radius: 6px;
        font-size: 0.9rem;
        color: var(--secondary-color);
      }

      .bedsheet-next ha-icon {
        color: var(--bedsheet-color, var(--primary-color));
        --mdc-icon-size: 18px;
      }

      .bedsheet-progress {
        margin-top: 12px;
      }

      .progress-bar {
        width: 100%;
        height: 8px;
        background: rgba(0,0,0,0.1);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 8px;
      }

      .progress-fill {
        height: 100%;
        background: var(--bedsheet-color, var(--primary-color));
        border-radius: 4px;
        transition: width 0.3s ease;
      }

      .progress-text {
        text-align: center;
        font-size: 0.85rem;
        color: var(--secondary-color);
        font-weight: 500;
      }

      .bedsheet-options {
        margin-top: 12px;
        padding: 12px;
        background: rgba(0,0,0,0.03);
        border-radius: 6px;
      }

      .option-buttons {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
      }

      .option-buttons button {
        padding: 8px 12px;
        border: 1px solid rgba(0,0,0,0.1);
        border-radius: 4px;
        background: white;
        color: var(--primary-color);
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .option-buttons button:hover {
        background: rgba(0,0,0,0.05);
        border-color: var(--bedsheet-color, var(--primary-color));
      }

      .calendar-container {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .calendar-container label {
        font-size: 0.9rem;
        font-weight: 500;
        color: var(--primary-color);
        margin-bottom: 4px;
      }

      .bedsheet-calendar {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid rgba(0,0,0,0.1);
        border-radius: 4px;
        background: white;
        color: var(--primary-color);
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .bedsheet-calendar:focus {
        outline: none;
        border-color: var(--primary-color);
        box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb, 0,0,0), 0.2);
      }

      .calendar-buttons {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin-top: 8px;
      }

      .calendar-buttons button {
        padding: 8px 12px;
        border: 1px solid rgba(0,0,0,0.1);
        border-radius: 4px;
        background: white;
        color: black;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .calendar-buttons button:hover {
        background: var(--primary-color);
        color: white;
      }

      @media (max-width: 500px) {
        .bedsheet-header {
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
        }

        .bedsheet-buttons {
          width: 100%;
          justify-content: stretch;
        }

        .bedsheet-button {
          flex: 1;
          justify-content: center;
        }

        .option-buttons {
          grid-template-columns: 1fr;
        }
      }
    `;
  }

  getCardSize() {
    return 8;
  }
});