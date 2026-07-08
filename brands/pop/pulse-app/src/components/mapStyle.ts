/** Dark slate Google Maps style - keeps the basemap quiet so the choropleth pops. */
export const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0b1018' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5d6b7d' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b1018' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#26334a' }] },
  { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ color: '#22304a' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#070b12' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3a4a63' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0d131d' }] },
];
