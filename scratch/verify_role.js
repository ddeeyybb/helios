async function verifyRole() {
  const base = 'http://localhost:3000';

  console.log('--- SIGN-UP PAGE CHECKS ---');
  const resSignup = await fetch(base + '/signup');
  const signupHtml = await resSignup.text();

  console.log('1. Has preview role "Installer":', signupHtml.includes('Installer'));
  console.log('2. Does NOT have "PV System Designer":', !signupHtml.includes('PV System Designer'));
  console.log('3. Does NOT have "Job Title":', !signupHtml.includes('Job Title'));
  console.log('4. Does NOT have "Professional Role":', !signupHtml.includes('Professional Role'));
  console.log('5. Does NOT have "Choose Role":', !signupHtml.includes('Choose Role'));
  console.log('6. Does NOT have "Select Role":', !signupHtml.includes('Select Role'));
  console.log('7. Has preview "Your Name":', signupHtml.includes('Your Name'));
  console.log('8. Has preview initials "PV":', signupHtml.includes('PV'));
  console.log('9. Has label "Full Name *":', signupHtml.includes('Full Name'));
  console.log('10. Has label "Email *":', signupHtml.includes('Email'));
  console.log('11. Has label "Password *":', signupHtml.includes('Password'));
  console.log('12. Has label "Confirm Password *":', signupHtml.includes('Confirm Password'));

  console.log('\n--- PROFILE CARD / DASHBOARD WITH JOHN DOE ---');
  const johnDoeUser = {
    id: 'inst_john_doe',
    fullName: 'John Doe',
    role: 'Installer',
    email: 'john.doe@example.com',
    initials: 'JD'
  };
  const cookieVal = encodeURIComponent(JSON.stringify(johnDoeUser));
  const resDash = await fetch(base + '/dashboard', {
    headers: { 'Cookie': 'helios_installer_session=' + cookieVal }
  });
  const dashHtml = await resDash.text();

  console.log('1. Profile card shows name "John Doe":', dashHtml.includes('John Doe'));
  console.log('2. Profile card shows role "Installer":', dashHtml.includes('Installer'));
  console.log('3. Profile card shows initials "JD":', dashHtml.includes('JD'));
  console.log('4. Does NOT show "PV System Designer":', !dashHtml.includes('PV System Designer'));
  console.log('5. Does NOT show "Lead PV System Designer":', !dashHtml.includes('Lead PV System Designer'));
  console.log('6. Green online indicator present:', dashHtml.includes('Online'));
}
verifyRole().catch(console.error);
