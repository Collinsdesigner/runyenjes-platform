import { useEffect, useState } from 'react';
import { api } from '../api/client';

type Settings = {
  institutionName?: string;
  shortName?: string;
  tagline?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  about?: string;
  physicalLocation?: string;
  googleMapsUrl?: string;
};

export default function AboutRTVC() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    api('/settings')
      .then((data) => setSettings(data))
      .catch(() => {});
  }, []);

  if (!settings) {
    return (
      <div className="p-6">
        Loading RTVC information...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div
          className="bg-white rounded-xl shadow p-8 text-center"
          style={{
            borderTop: `8px solid ${settings.primaryColor || '#0B7A2B'}`
          }}
        >
          {settings.logoUrl && (
            <img
              src={settings.logoUrl}
              alt="RTVC Logo"
              className="w-36 h-36 object-contain mx-auto mb-4"
            />
          )}

          <h1 className="text-3xl font-bold">
            {settings.institutionName}
          </h1>

          <p className="text-lg font-semibold text-gray-600 mt-2">
            {settings.shortName}
          </p>

          <p className="italic mt-3 text-gray-700">
            "{settings.tagline}"
          </p>
        </div>


        {/* About */}
        <section className="bg-white rounded-xl shadow p-6">
          <h2
            className="text-xl font-bold mb-4"
            style={{ color: settings.primaryColor }}
          >
            About Runyenjes TVC
          </h2>

          <p className="text-gray-700 leading-relaxed">
            {settings.about ||
              'Runyenjes Technical & Vocational College is committed to technical skills development, innovation and entrepreneurship.'}
          </p>
        </section>


        {/* Location */}
        <section className="bg-white rounded-xl shadow p-6">
          <h2
            className="text-xl font-bold mb-4"
            style={{ color: settings.primaryColor }}
          >
            Location
          </h2>

          <p className="text-gray-700">
            📍 {settings.physicalLocation}
          </p>

          {settings.googleMapsUrl && (
            <a
              href={settings.googleMapsUrl}
              target="_blank"
              className="inline-block mt-4 underline"
              style={{ color: settings.primaryColor }}
            >
              View on Google Maps
            </a>
          )}
        </section>


        {/* Contact */}
        <section className="bg-white rounded-xl shadow p-6">
          <h2
            className="text-xl font-bold mb-4"
            style={{ color: settings.primaryColor }}
          >
            Contact Information
          </h2>

          <div className="space-y-2 text-gray-700">
            <p>📮 {settings.address}</p>
            <p>☎ {settings.phone}</p>
            <p>✉ {settings.email}</p>
            <p>🌐 {settings.website}</p>
          </div>
        </section>


        {/* Branding */}
        <section className="bg-white rounded-xl shadow p-6">
          <h2
            className="text-xl font-bold mb-4"
            style={{ color: settings.primaryColor }}
          >
            School Branding
          </h2>

          <div className="flex gap-6">

            <div>
              <p className="text-sm text-gray-500">
                Primary Colour
              </p>

              <div
                className="w-20 h-10 rounded mt-2 border"
                style={{
                  backgroundColor: settings.primaryColor
                }}
              />

              <p className="text-sm mt-1">
                {settings.primaryColor}
              </p>
            </div>


            <div>
              <p className="text-sm text-gray-500">
                Secondary Colour
              </p>

              <div
                className="w-20 h-10 rounded mt-2 border"
                style={{
                  backgroundColor: settings.secondaryColor
                }}
              />

              <p className="text-sm mt-1">
                {settings.secondaryColor}
              </p>
            </div>

          </div>
        </section>

      </div>
    </div>
  );
}
