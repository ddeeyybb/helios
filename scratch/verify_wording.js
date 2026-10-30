async function verifyWording() {
  const base = 'http://localhost:3000';

  // 1. Check Login page
  const resLogin = await fetch(base + '/login');
  const loginHtml = await resLogin.text();

  console.log('--- LOGIN PAGE CHECKS ---');
  console.log('1. Has HELIOS-LOAD:', loginHtml.includes('HELIOS-LOAD'));
  console.log('2. Has Installer Portal:', loginHtml.includes('Installer Portal'));
  console.log('3. Has "Sign in to your installer account.":', loginHtml.includes('Sign in to your installer account.'));
  console.log('4. Has "Sign In":', loginHtml.includes('Sign In'));
  console.log('5. Has placeholder "Enter your email":', loginHtml.includes('placeholder="Enter your email"'));
  console.log('6. Has placeholder "Enter your password":', loginHtml.includes('placeholder="Enter your password"'));
  console.log('7. Has "Don\'t have an account?":', loginHtml.includes("Don't have an account?"));
  console.log('8. Has button "Create Account":', loginHtml.includes('Create Account'));
  console.log('9. No old "Don\'t have an installer account?":', !loginHtml.includes("Don't have an installer account?"));
  console.log('10. No technical footer:', !loginHtml.includes('Temporary Development Authentication'));
  console.log('11. No technical badge:', !loginHtml.includes('Installer Only Portal • End-to-End Precision CAD'));

  // 2. Check Sign-Up page
  const resSignup = await fetch(base + '/signup');
  const signupHtml = await resSignup.text();

  console.log('\n--- SIGN-UP PAGE CHECKS ---');
  console.log('1. Has "Create Installer Account":', signupHtml.includes('Create Installer Account'));
  console.log('2. Has "Create an account to get started.":', signupHtml.includes('Create an account to get started.'));
  console.log('3. Has preview "Your Name":', signupHtml.includes('Your Name'));
  console.log('4. Has preview "PV System Designer":', signupHtml.includes('PV System Designer'));
  console.log('5. Has preview "Online":', signupHtml.includes('Online'));
  console.log('6. Has preview default initials "PV":', signupHtml.includes('PV'));
  console.log('7. Has placeholder "Enter your full name":', signupHtml.includes('placeholder="Enter your full name"'));
  console.log('8. Has label "Job Title":', signupHtml.includes('Job Title'));
  console.log('9. Has placeholder "Example: PV System Designer":', signupHtml.includes('placeholder="Example: PV System Designer"'));
  console.log('10. Has placeholder "Enter your email":', signupHtml.includes('placeholder="Enter your email"'));
  console.log('11. Has placeholder "Create a password":', signupHtml.includes('placeholder="Create a password"'));
  console.log('12. Has placeholder "Enter your password again":', signupHtml.includes('placeholder="Enter your password again"'));
  console.log('13. Has button "Create Installer Account":', signupHtml.includes('Create Installer Account'));
  console.log('14. Has "Already have an account?":', signupHtml.includes('Already have an account?'));
  console.log('15. No old "Already have an installer account?":', !signupHtml.includes('Already have an installer account?'));
  console.log('16. No technical footer:', !signupHtml.includes('Temporary Development Authentication'));

  // 3. Check Dashboard with installer profile cookie
  const mockUser = {
    id: 'inst_user_1',
    fullName: 'John Doe',
    role: 'Solar PV Installer',
    email: 'john@example.com',
    initials: 'JD'
  };
  const cookieVal = encodeURIComponent(JSON.stringify(mockUser));
  const resDash = await fetch(base + '/dashboard', {
    headers: { 'Cookie': 'helios_installer_session=' + cookieVal }
  });
  const dashHtml = await resDash.text();

  console.log('\n--- DASHBOARD CHECKS ---');
  console.log('1. Has "Welcome, John Doe":', dashHtml.includes('Welcome, John Doe'));
  console.log('2. Has "Your installer workspace is ready.":', dashHtml.includes('Your installer workspace is ready.'));
  console.log('3. Has "No Sites Yet":', dashHtml.includes('No Sites Yet'));
  console.log('4. Has "Create or select a site to begin a rooftop assessment.":', dashHtml.includes('Create or select a site to begin a rooftop assessment.'));
  console.log('5. Profile card shows initials "JD":', dashHtml.includes('JD'));
  console.log('6. Profile card shows role "Solar PV Installer":', dashHtml.includes('Solar PV Installer'));
  console.log('7. Online indicator present:', dashHtml.includes('Online'));
}
verifyWording().catch(console.error);
