# Tenki which is Japanese for Weather

This is a weather display for Obsidian (https://obsidian.md).


![2023-07-03_15h59_41](https://github.com/ms3056/Tenki/assets/23712700/ce8c220b-9935-4883-8542-79ace4f335b4)


# Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/Tenki/`.

# Usage
- Head over to weatherapi.com (you can link to it from the settings) and get your free api key and paste it into the settings
- Enter your city, and you should see the weather update
- If the app is not visible then from the command menu (control+p on Windows) type tenki and enter `Tenki: Open`
- The weather feed doesn't update more than about every 30 minutes; Tenki enforces a 30-minute minimum refresh interval by default
- All of the weather display elements have CSS classes - take a look at styles.css and feel free to create your own snippets to hide or style the elements how you like


# Network Usage
According to the Obsidian Developer Piolicy in the [Disclosures](https://docs.obsidian.md/Developer+policies#Disclosures) section an Obsidian plugin must explain which network services are used and why.
This plugin retrieves information from the internet to get the weather data for display at `https://api.weatherapi.com/v1/` combined with the user's personal API key. 



# Buy Me A Coffee

If you find Tenki useful, consider supporting its development by buying me a coffee:

<p align="center">
  <a href="https://www.buymeacoffee.com/mstam30561" target="_blank">
    <img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174">
  </a>
</p>

# Help and Support

I would like to express my gratitude to the members of the Discord community who have provided valuable help and support. Thank you very much!

## API Documentation

For more information about Obsidian's API, refer to the [Obsidian API Documentation](https://docs.obsidian.md/Home).

## Changelog

### 0.7.7
- Security: Switch all network calls and icons to HTTPS.
- Robustness: Centralized interval lifecycle; prevent duplicate timers.
- Defaults: Enforce 30-minute minimum refresh interval.
- UX: Increase location debounce; skip empty values.
- Error handling: Notices for missing settings and fetch failures.
- Build: Upgrade esbuild to 0.27.x to address advisory GHSA-67mh-4wv8-2f99.
