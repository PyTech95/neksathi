import React from "react";

export default function PrivacyPolicy() {
  return (
    <section
      style={{
        minHeight: "100vh",
        background: "#07070D",
        color: "#E8E8F5",
        padding: "60px 20px",
      }}
    >
      <article
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          background: "#0D0D1A",
          border: "1px solid rgba(139,92,246,.30)",
          borderRadius: "24px",
          padding: "32px",
          lineHeight: "1.7",
        }}
      >
        <h1>Privacy Policy — NekSathi</h1>

        <p>
          <strong>Last updated:</strong> October 1, 2026
        </p>

        <p>
          NekSathi is a safety and Smart QR platform designed to help
          vehicle owners, families and users communicate during safety,
          vehicle and emergency situations.
        </p>

        <h2>1. Information we collect</h2>

        <p>
          Depending on the features you use, NekSathi may process your
          name, phone number, email address, profile information, vehicle
          information, Smart QR information, family safety information,
          incident reports, support requests and account information.
        </p>

        <h2>2. Camera and photos</h2>

        <p>
          NekSathi may access your camera when you choose to scan a Smart
          QR code or capture evidence related to an incident such as wrong
          parking, vehicle blocking, vehicle damage or another safety
          report.
        </p>

        <p>
          Incident reports may include a vehicle or scene photograph and,
          where the safety-reporting feature requires it, reporter evidence.
          These images are used to support the safety report and provide
          relevant information to the vehicle owner.
        </p>

        <h2>3. Location information</h2>

        <p>
          With your permission, NekSathi may process precise or approximate
          location information for safety features including incident
          location, SOS, family safety, live-location sharing, safe zones
          and related map functionality.
        </p>

        <h2>4. Microphone and voice calling</h2>

        <p>
          NekSathi uses microphone access when you initiate or answer a
          secure in-app voice call. The feature is designed so users can
          communicate without exposing the vehicle owner's personal phone
          number to the person scanning a Smart QR code.
        </p>

        <h2>5. Notifications and device information</h2>

        <p>
          NekSathi may process notification tokens and limited device
          information required to provide safety alerts, incident updates,
          incoming-call notifications and other app functionality.
        </p>

        <h2>6. Vehicle and incident information</h2>

        <p>
          Smart QR reports may include the type of incident, vehicle
          identifier, photographs, time, location, optional reporter phone
          number, owner response and incident status.
        </p>

        <h2>7. How we use information</h2>

        <p>
          We use information to operate NekSathi, authenticate users,
          provide Smart QR and safety functionality, deliver incident and
          emergency alerts, enable secure communication, provide family and
          theft-protection functionality, maintain account security,
          provide customer support and improve reliability.
        </p>

        <h2>8. Service providers</h2>

        <p>
          We may use technology and infrastructure providers to operate
          NekSathi, including cloud hosting, databases, notification,
          communication and security services. Such providers process data
          only as necessary to provide the relevant service.
        </p>

        <h2>9. Data selling</h2>

        <p>
          NekSathi does not sell personal information.
        </p>

        <h2>10. Data security</h2>

        <p>
          We use reasonable administrative and technical safeguards
          designed to protect information against unauthorized access,
          alteration, disclosure or destruction.
        </p>

        <p>
          Communications with NekSathi services are transmitted using
          secure HTTPS connections where supported.
        </p>

        <h2>11. Data retention</h2>

        <p>
          We retain information only for as long as reasonably necessary
          for providing the service, security, fraud prevention, legal
          obligations and legitimate operational requirements.
        </p>

        <h2>12. Account and data deletion</h2>

        <p>
          Users may request deletion of their NekSathi account and
          associated personal data through the account deletion option
          available in the app or through our account deletion page:
        </p>

        <p>
          <a
            href="/delete-account"
            style={{
              color: "#22D3EE",
              textDecoration: "none",
            }}
          >
            https://neksathi.in/delete-account
          </a>
        </p>

        <p>
          Certain information may be retained where required for legal,
          security, fraud-prevention or regulatory purposes.
        </p>

        <h2>13. Children's privacy</h2>

        <p>
          NekSathi is not intended for children to independently provide
          personal information without appropriate parental or guardian
          involvement where required by applicable law.
        </p>

        <h2>14. Changes to this policy</h2>

        <p>
          We may update this Privacy Policy when NekSathi features or legal
          requirements change. The latest version will be published on this
          page with its updated date.
        </p>

        <h2>15. Contact and operator</h2>

        <p>
          NekSathi
          <br />
          Operated by{" "}
          <a
            href="https://pytechdigital.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#22D3EE",
              textDecoration: "none",
              fontWeight: "700",
            }}
          >
            PyTech
          </a>
        </p>
      </article>
    </section>
  );
}
