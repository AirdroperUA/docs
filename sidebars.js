// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  tutorialSidebar: [
    // Глобальна вступна сторінка для всіх тем (docs/intro.md)
    'intro',

    {
      type: 'category',
      label: 'GNSS sanity board',
      collapsed: true,
      items: [
        // Головна сторінка GNSS-гайда
        'gnss/gnss',

        // Референси та технічні розділи
        'gnss/gnss_code_params',
        'gnss/gnss_hardware',
        'gnss/gnss_wiring',
        'gnss/gnss_led_status',
        'gnss/gnss_mavlink',
        'gnss/gnss_ardupilot_integration',
        'gnss/gnss_security_model',
        'gnss/gnss_faq',
        'gnss/gnss_changelog',
      ],
    },
{
      type: 'category',
      label: 'Starlink',
      collapsed: true,
      items: [
        'starlink/starlink_mini', // docs/starlink/starlink_mini.md
        'starlink/starlink_stardebug',
        'starlink/starlink_mini_plans_aviation', 
        'starlink/starlink_mini_gnss_limitations'
      ],
    },
    // Сюди потім можна додавати інші категорії для інших тем
    // {
    //   type: 'category',
    //   label: 'UAV платформи',
    //   collapsed: true,
    //   items: [
    //     'uav/overview',
    //     // ...
    //   ],
    // },
  ],
};

export default sidebars;
