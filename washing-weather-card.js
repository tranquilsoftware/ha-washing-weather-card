// Washing Weather Card
customElements.define('washing-weather-card', class extends HTMLElement {
  
    setConfig(config) {
      this.config = config || {};
    }
  
    set hass(hass) {
      // Create card HTML if doesn't exist
      if (!this.shadowRoot) {
        this.innerHTML = `
          <ha-card header="Weather Data">
            <div class="card-content">
              <div id="weather-info">Loading weather data...</div>
            </div>
          </ha-card>
        `;
      }
  
      const contentDiv = this.querySelector('#weather-info');
      
      // Try different common weather entity names
      let weatherEntity = hass.states['weather.forecast_home'];

      // Log which weather entity is being used
      if (weatherEntity) {
        console.log('Using weather entity:', weatherEntity.entity_id || 'Unknown entity ID');
      }
      
      // Debugging what entities are here
      console.log('Available weather entities:', 
        Object.keys(hass.states).filter(key => key.startsWith('weather.')));
      
      if (!weatherEntity) {
        if (contentDiv) contentDiv.innerHTML = 'Weather entity not found';
        console.log('Weather entity weather.forecast_home not found');
        return;
      }
      
      // Log every object in weatherEntity
      console.log('=== COMPLETE WEATHER ENTITY OBJECT ===');
      console.log('weatherEntity object:', weatherEntity);
      console.log('weatherEntity keys:', Object.keys(weatherEntity));
      
      // Log each property of weatherEntity
      Object.keys(weatherEntity).forEach(key => {
        console.log(`weatherEntity.${key}:`, weatherEntity[key]);
      });
      
      // Log attributes specifically
      console.log('=== WEATHER ENTITY ATTRIBUTES ===');
      console.log('weatherEntity.attributes:', weatherEntity.attributes);
      console.log('weatherEntity.attributes keys:', Object.keys(weatherEntity.attributes || {}));
      
      // Log each attribute
      if (weatherEntity.attributes) {
        Object.keys(weatherEntity.attributes).forEach(attrKey => {
          console.log(`weatherEntity.attributes.${attrKey}:`, weatherEntity.attributes[attrKey]);
        });
      }
      
      // Log forecast data specifically
      console.log('=== FORECAST DATA ===');
      console.log('weatherEntity.attributes.forecast:', weatherEntity.attributes?.forecast);
      if (weatherEntity.attributes?.forecast) {
        console.log('Forecast array length:', weatherEntity.attributes.forecast.length);
        weatherEntity.attributes.forecast.forEach((forecast, index) => {
          console.log(`Forecast [${index}]:`, forecast);
        });
      }
  
      // Extract weather data including rain detection
      const weatherData = {
        condition: weatherEntity.state,
        temperature: weatherEntity.attributes.temperature,
        humidity: weatherEntity.attributes.humidity,
        wind_speed: weatherEntity.attributes.wind_speed,
        wind_bearing: weatherEntity.attributes.wind_bearing,
        precipitation: weatherEntity.attributes.precipitation || 0,
        precipitation_probability: weatherEntity.attributes.precipitation_probability || 0,
        precipitation_unit: weatherEntity.attributes.precipitation_unit || 'mm',
        forecast: weatherEntity.attributes.forecast || []
      };
  
      // RAIN DETECTION
      const isRaining = weatherData.precipitation > 0;
      const willRain = weatherData.precipitation_probability > 50;
      console.log(`RAIN STATUS: Currently raining: ${isRaining}, Will rain: ${willRain}`);
  
      // Log full weather data
      console.log('=== WEATHER DATA ===');
      console.log(JSON.stringify(weatherData, null, 2));
      
      // Log rain data
      const rainData = weatherData.forecast.map(day => ({
        datetime: day.datetime,
        precipitation: day.precipitation || 0,
        precipitation_probability: day.precipitation_probability || 0,
        condition: day.condition
      }));
      console.log('=== RAIN FORECAST ===');
      console.log(JSON.stringify(rainData, null, 2));
  
      // Log wind data
      const windData = weatherData.forecast.map(day => ({
        datetime: day.datetime,
        wind_speed: day.wind_speed || weatherData.wind_speed,
        wind_bearing: day.wind_bearing || weatherData.wind_bearing
      }));
      console.log('=== WIND FORECAST ===');
      console.log(JSON.stringify(windData, null, 2));
  
      // Update display with rain info and daily forecast
      if (contentDiv) {
        const rainStatus = weatherData.precipitation > 0 ? 'RAINING' : 
                          weatherData.precipitation_probability > 50 ? 'RAIN LIKELY' : 'NO RAIN';
        
        // Build daily forecast HTML
        let forecastHTML = '';
        if (weatherData.forecast && weatherData.forecast.length > 0) {
          forecastHTML = '<div style="margin-top: 15px;"><strong>Daily Forecast:</strong><br>';
          weatherData.forecast.slice(0, 7).forEach((day, index) => {
            const date = new Date(day.datetime).toLocaleDateString('en-US', { 
              weekday: 'short', 
              month: 'short', 
              day: 'numeric' 
            });
            const condition = day.condition || 'unknown';
            const tempHigh = day.temperature || day.templow || 'N/A';
            const tempLow = day.templow || 'N/A';
            const precipitation = day.precipitation || 0;
            const precipProb = day.precipitation_probability || 0;
            const windSpeed = day.wind_speed || 'N/A';
            
            const dayMarker = index === 0 ? '[TODAY]' : '';
            const rainIcon = precipitation > 0 ? '[RAIN]' : precipProb > 50 ? '[LIKELY]' : '[DRY]';
            
            forecastHTML += `
              <div style="padding: 5px 0; border-bottom: 1px solid #eee;">
                <strong>${date}</strong> ${dayMarker} - ${condition} ${rainIcon}<br>
                High: ${tempHigh}° Low: ${tempLow}° | Wind: ${windSpeed}km/h | Rain: ${precipitation}mm (${precipProb}%)
              </div>
            `;
          });
          forecastHTML += '</div>';
        } else {
          forecastHTML = '<p><em>No forecast data available</em></p>';
        }
        
        contentDiv.innerHTML = `
          <div style="font-family: Arial, sans-serif;">
            <p><strong>Current:</strong> ${weatherData.condition} - ${weatherData.temperature}°</p>
            <p><strong>Rain:</strong> ${rainStatus} (${weatherData.precipitation}${weatherData.precipitation_unit}, ${weatherData.precipitation_probability}%)</p>
            <p><strong>Wind:</strong> ${weatherData.wind_speed} km/h</p>
            <p><strong>Humidity:</strong> ${weatherData.humidity}%</p>
            ${forecastHTML}
            <p style="margin-top: 15px;"><em>Check console for full JSON data</em></p>
          </div>
        `;
      }
    }
    
  
    getCardSize() {
      return 8; // Increased size for forecast display
    }
  });