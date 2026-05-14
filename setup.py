from setuptools import setup, find_packages

setup(
    name="erpnext_npdi_suite",
    version="0.0.1",
    description="Suite NPDI - Planificador de ruta crítica y panel de control para ERPNext",
    author="Tecnofood",
    author_email="tecnofoodmx@gmail.com",
    packages=find_packages(),
    include_package_data=True,
    zip_safe=False,
    install_requires=["frappe"],
)
